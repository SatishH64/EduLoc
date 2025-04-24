from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.http import JsonResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Place, EducationEvent
from django.utils.timezone import now
from datetime import timedelta
from django.core.cache import cache

# from Edu.settings import GOOGLE_MAPS_API_KEY
from .models import FavoriteLibrary
import requests


def index(request):
    return render(request, 'index.html', {'GOOGLE_MAPS_API_KEY': settings.GOOGLE_MAPS_API_KEY})


class NearbySearchView(APIView):
    def get(self, request, *args, **kwargs):
        # Extract query parameters
        location = request.query_params.get('location')
        radius = request.query_params.get('radius', '1500')
        place_type = request.query_params.get('type')
        query = request.query_params.get('q')

        # Validate required location parameter
        if not location:
            return Response({"error": "Location parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate and parse location coordinates
        try:
            latitude, longitude = map(float, location.split(','))
            if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
                raise ValueError("Invalid latitude or longitude values")
        except ValueError:
            return Response({"error": "Invalid location format. Use 'latitude,longitude'"},
                            status=status.HTTP_400_BAD_REQUEST)

        # Validate and convert radius
        try:
            radius = int(radius)
            if radius <= 0 or radius > 50000:
                raise ValueError("Radius must be between 1 and 50,000 meters")
        except ValueError:
            return Response({"error": "Invalid radius value"}, status=status.HTTP_400_BAD_REQUEST)

        # Handle place_type: convert to list if string, use default if None
        if place_type:
            if isinstance(place_type, str):
                place_type = [t.strip() for t in place_type.split(',')]
        else:
            place_type = ['library', 'school', 'university', 'book_store', 'primary_school', 'secondary_school']

        # Generate cache key
        cache_key = f"nearby_search:{latitude}:{longitude}:{radius}:{','.join(place_type)}:{query}"
        cached_places = cache.get(cache_key)
        if cached_places:
            return Response({"places": cached_places}, status=status.HTTP_200_OK)

        # Query the database for cached results
        db_places = Place.objects.filter(
            location__latitude__gte=latitude - 0.01,
            location__latitude__lte=latitude + 0.01,
            location__longitude__gte=longitude - 0.01,
            location__longitude__lte=longitude + 0.01,
            updated_at__gte=now() - timedelta(days=1)
        )

        # Collect existing place IDs
        existing_place_ids = set(db_places.values_list('place_id', flat=True))

        # Fetch missing data from the API
        api_key = settings.GOOGLE_MAPS_API_KEY
        base_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        all_results = []

        for p_type in place_type:
            params = {
                "location": f"{latitude},{longitude}",
                "radius": radius,
                "type": p_type,
                "key": api_key
            }
            if query:
                params["keyword"] = query

            try:
                response = requests.get(base_url, params=params, timeout=10)
                response.raise_for_status()
                places_data = response.json()

                if places_data.get('status') == 'OK':
                    results = places_data.get('results', [])
                    print(results[10]['types'])
                    for result in results:
                        if result['place_id'] not in existing_place_ids:
                            all_results.append({
                                "place_id": result['place_id'],
                                'types': result['types'],
                                "name": result.get('name'),
                                "latitude": result['geometry']['location']['lat'],
                                "longitude": result['geometry']['location']['lng'],
                                "vicinity": result.get('vicinity'),
                                "rating": result.get('rating'),
                                "phone_number": result.get('formatted_phone_number'),
                                "website": result.get('website'),
                            })
            except requests.RequestException as e:
                return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Save missing data to the database in bulk
        Place.objects.bulk_create([
            Place(
                place_id=place['place_id'],
                name=place['name'],
                location=[place['latitude'], place['longitude']],
                # location={"latitude": result['geometry']['location']['lat'], "longitude": result['geometry']['location']['lng']},
                # latitude=place['latitude'],
                # longitude=place['longitude'],
                rating=place['rating'],
                types=place['types'],
                phone_number=place['phone_number'],
                website=place['website'],
                vicinity=place['vicinity'],
            )
            for place in all_results
        ], ignore_conflicts=True)

        # Combine cached and newly fetched data
        combined_results = list(db_places.values()) + all_results

        # Cache the results
        cache.set(cache_key, combined_results, timeout=3600)  # Cache for 1 hour

        return Response({"places": combined_results}, status=status.HTTP_200_OK)


@csrf_exempt
def place_details(request):
    place_id = request.GET.get('placeId')
    if not place_id:
        return JsonResponse({'error': 'placeId parameter is required'}, status=400)

    api_key = settings.GOOGLE_MAPS_API_KEY
    url = f'https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields=formatted_phone_number,website&key={api_key}'

    try:
        response = requests.get(url)
        return JsonResponse(response.json())
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


class EducationEventSearchView(APIView):
    def get(self, request):
        location = request.query_params.get("location")
        radius = request.query_params.get("radius", "10")
        start_date = request.query_params.get("start", None)

        if not location:
            return Response({"error": "Location parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        lat, lon = map(float, location.split(','))

        # Convert radius to kilometers if needed
        if radius.replace('.', '', 1).isdigit() and not radius.endswith("km"):
            radius = int(radius) // 1000
            radius = f"{radius}km"

        # Generate cache key
        cache_key = f"education_events:{lat}:{lon}:{radius}:{start_date}"
        cached_events = cache.get(cache_key)
        if cached_events:
            return Response(cached_events, status=200)

        # Query database for cached events
        db_events = EducationEvent.objects.filter(
            latitude__range=(lat - 0.1, lat + 0.1),
            longitude__range=(lon - 0.1, lon + 0.1),
            start__gte=start_date if start_date else now() - timedelta(days=7)
        )

        if db_events.exists():
            events = list(db_events.values())
            cache.set(cache_key, events, timeout=3600)  # Cache for 1 hour
            return Response(events, status=200)

        # Fetch missing data from the API
        headers = {"Authorization": f"Bearer {settings.PREDICTHQ_API_KEY}"}
        params = {
            "within": f"{radius}@{lat},{lon}",
            "category": "academic,conferences,performing-arts,community",
            "sort": "rank"
        }
        if start_date:
            params["active.gte"] = start_date

        response = requests.get("https://api.predicthq.com/v1/events/", headers=headers, params=params)
        if response.status_code != 200:
            return Response({"error": "Failed to fetch events", "details": response.json()},
                            status=response.status_code)

        # Save new events to the database
        events = [
            {
                "title": e["title"],
                "status": e["state"],
                "start": e["start"],
                "end": e["end"],
                "category": e["category"],
                "latitude": e["location"][0],
                "longitude": e["location"][1],
                "description": e.get("description", "")
            }
            for e in response.json().get("results", [])
            if e.get("location")
        ]

        EducationEvent.objects.bulk_create([
            EducationEvent(
                title=event["title"],
                status=event["status"],
                start=event["start"],
                end=event["end"],
                category=event["category"],
                latitude=event["latitude"],
                longitude=event["longitude"],
                description=event["description"]
            )
            for event in events
        ], ignore_conflicts=True)

        # Cache the results
        cache.set(cache_key, events, timeout=3600)  # Cache for 1 hour

        return Response(events, status=200)


class BookSearchView(APIView):
    def get(self, request):

        # print(request)
        title = request.query_params.get('title')
        author = request.query_params.get('author')
        # print(request.query_params.get('search-books'))
        if not author and not title:
            return Response({"error": "Please provide author or title of the book."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Generate cache key
        # cache_key = f"book_search:{title}:{author}"
        # cached_data = cache.get(cache_key)
        # if cached_data:
        #     return Response({"books": cached_data})

        base_url = "https://openlibrary.org/search.json"
        params = {}
        if title:
            params['title'] = title
        if author:
            params['author'] = author

        response = requests.get(base_url, params=params)

        if response.status_code != 200:
            return Response({"error": "Failed to fetch data from OpenLibrary"},
                            status=response.status_code)

        data = response.json()
        books = []
        for item in data.get("docs", []):
            books.append({
                "title": item.get("title", "Untitled"),
                "author": ", ".join(item.get("author_name", ["Unknown Author"])),
                "cover_url": f"http://covers.openlibrary.org/b/id/{item['cover_i']}-L.jpg" if item.get(
                    "cover_i") else None,
                "first_publish_year": item.get("first_publish_year", None),
                "key": item.get("key", None)
            })

        # Cache the result for 1 hour
        # cache.set(cache_key, books, timeout=3600)

        return Response({"books": books})


@login_required
def toggle_favorite_library(request):
    if request.method == 'POST':
        library_id = request.POST.get('library_id')
        library_name = request.POST.get('library_name')
        library_address = request.POST.get('library_address')

        # Check if the library is already favorite
        favorite, created = FavoriteLibrary.objects.get_or_create(
            user=request.user,
            library_id=library_id,
            defaults={'library_name': library_name, 'library_address': library_address}
        )

        if not created:
            # If it already exists, remove it
            favorite.delete()
            return JsonResponse({'status': 'removed'})

        return JsonResponse({'status': 'added'})

    return JsonResponse({'error': 'Invalid request'}, status=400)
