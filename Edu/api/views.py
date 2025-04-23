from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.http import JsonResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
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
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        # Validate required location parameter
        if not location:
            return Response(
                {"error": "Location parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate and parse location coordinates
        try:
            latitude, longitude = map(float, location.split(','))
            if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
                raise ValueError("Invalid latitude or longitude values")
        except ValueError:
            return Response(
                {"error": "Invalid location format. Use 'latitude,longitude'"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate and convert radius
        try:
            radius = int(radius)
            if radius <= 0 or radius > 50000:
                raise ValueError("Radius must be between 1 and 50,000 meters")
        except ValueError:
            return Response(
                {"error": "Invalid radius value"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Handle place_type: convert to list if string, use default if None
        if place_type:
            if isinstance(place_type, str):
                place_type = [t.strip() for t in place_type.split(',')]
        else:
            place_type = ['library', 'school', 'university', 'book_store', 'primary_school', 'secondary_school']

        # Validate place_type
        valid_types = {'library', 'school', 'university', 'book_store', 'primary_school', 'secondary_school'}
        if not all(pt in valid_types for pt in place_type):
            return Response(
                {"error": f"Invalid place type. Must be one of: {', '.join(valid_types)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Log the place types being queried
        # print(f"Querying place types: {place_type}")

        # Construct Google Places API URL
        api_key = settings.GOOGLE_MAPS_API_KEY
        if not api_key:
            return Response(
                {"error": "Server configuration error: Missing API key"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        base_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        all_results = []
        error_messages = []

        # Make API request for each place type
        for p_type in place_type:
            params = {
                "location": f"{latitude},{longitude}",
                "radius": radius,
                "type": p_type,
                "key": api_key
            }
            if query:
                params["keyword"] = query

            # print(f"Making request for type: {p_type}, params: {params}")

            try:
                # Make API request
                places_response = requests.get(base_url, params=params, timeout=10)
                places_response.raise_for_status()
                places_data = places_response.json()

                # Log raw response for debugging
                # print(
                #     f"Response for {p_type}: status={places_data.get('status')}, results={len(places_data.get('results', []))}")

                # Check API response status
                if places_data.get('status') != 'OK':
                    error_message = places_data.get('error_message', 'Unknown error')
                    error_messages.append(f"API error for type {p_type}: {error_message}")
                    print(f"Error for {p_type}: {error_message}")
                    continue

                # Add results to the combined list
                results = places_data.get('results', [])
                # print(f"Found {len(results)} places for type {p_type}")
                all_results.extend(results)

            except requests.Timeout:
                error_messages.append(f"Timeout for type {p_type}")
                print(f"Timeout for type {p_type}")
                continue
            except requests.RequestException as e:
                error_messages.append(f"Request error for type {p_type}: {str(e)}")
                print(f"Request error for type {p_type}: {str(e)}")
                continue

        # Remove duplicates based on place_id
        unique_results = {place['place_id']: place for place in all_results if 'place_id' in place}.values()

        # If no results and errors occurred, return error details
        if not unique_results and error_messages:
            return Response(
                {
                    "error": "No results found",
                    "details": error_messages
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Log final result count
        # print(f"Total unique places returned: {len(unique_results)}")

        return Response(
            {
                "places": list(unique_results),
                "errors": error_messages if error_messages else None
            },
            status=status.HTTP_200_OK
        )


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
        # search_term = request.query_params.get("q", "academic")
        start_date = request.query_params.get("start", None)
        # end_date = request.query_params.get("end", None)

        if not location:
            return Response({"error": "Location parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        lat, lon = location.split(',')

        if radius.replace('.', '', 1).isdigit() and not radius.endswith("km"):
            radius = int(radius) // 1000
            radius = f"{radius}km"

        headers = {
            "Authorization": f"Bearer {settings.PREDICTHQ_API_KEY}"
        }
        # get place_id
        # id_params = {
        #     "location": f"@{lat},{lon}",
        #     "offset": 10,
        # }
        # place_id = requests.get("https://api.predicthq.com/v1/places/", headers=headers, params=id_params)
        # response_data = place_id.json()
        # results = response_data.get("results", [])
        # print(results)
        # # id =
        # print("id",id)
        # params = {
        #     "place.scope": f"{id}",
        #     "category": "academic,conferences,performing-arts,community",
        #     "sort":"rank",
        # }
        params = {
            "within": f"{radius}@{lat},{lon}",
            "category": "academic,conferences,performing-arts,community",
            "sort": "rank"
        }
        print(radius)
        if start_date:
            params["active.gte"] = start_date
        # if end_date:
        #     params["start.lte"] = end_date

        response = requests.get("https://api.predicthq.com/v1/events/", headers=headers, params=params)
        # print(response.json())
        if response.status_code != 200:
            return Response({"error": "Failed to fetch events", "details": response.json()},
                            status=response.status_code)
        events = [
            {
                "title": e["title"],
                "status": e["state"],
                "start": e["start"],
                "end": e["end"],
                "category": e["category"],
                "location": e.get("location"),
                "description": e.get("description", "")
            }
            for e in response.json().get("results", [])
            if e.get("location")
        ]
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
