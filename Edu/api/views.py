from django.contrib.admin.utils import unquote
from django.core.cache import cache
from django.db import transaction
from django.shortcuts import render
from django.views.decorators.cache import cache_page
from django.utils.decorators import method_decorator
from django.http import JsonResponse
from django.conf import settings
from django.contrib.auth.decorators import login_required
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import requests
import hashlib
import time

from api.models import Place, FavoriteLibrary


def index(request):
    return render(request, 'index.html', {'GOOGLE_MAPS_API_KEY': settings.GOOGLE_MAPS_API_KEY})


class NearbySearchView(APIView):
    def get(self, request, *args, **kwargs):
        location = request.query_params.get('location')
        radius = request.query_params.get('radius', '1500')
        place_type = request.query_params.get('type')
        query = request.query_params.get('q')

        if not location:
            return Response({"error": "Location parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            latitude, longitude = map(float, location.split(','))
            if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
                raise ValueError("Invalid latitude or longitude values")
        except ValueError:
            return Response({"error": "Invalid location format. Use 'latitude,longitude'"},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            radius = int(radius)
            if radius <= 0 or radius > 50000:
                raise ValueError("Radius must be between 1 and 50,000 meters")
        except ValueError:
            return Response({"error": "Invalid radius value"}, status=status.HTTP_400_BAD_REQUEST)

        if place_type:
            if isinstance(place_type, str):
                place_type = [t.strip() for t in place_type.split(',')]
        else:
            place_type = ['library', 'school', 'university', 'book_store', 'primary_school', 'secondary_school']

        # Create a cache key based on the parameters
        cache_key = f"nearby:{location}:{radius}:{','.join(sorted(place_type))}"
        if query:
            cache_key += f":{query}"

        # Try to get data from cache
        cached_data = cache.get(cache_key)
        if cached_data:
            print(f"Cache hit for {cache_key}")
            return Response({"places": cached_data, "cache_hit": True}, status=status.HTTP_200_OK)

        # If not in cache, proceed with API call
        api_key = settings.GOOGLE_MAPS_API_KEY
        base_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        all_results = []
        processed_place_ids = set()
        places_to_save = []

        for p_type in place_type:
            # Create a cache key for this specific type
            type_cache_key = f"{cache_key}:{p_type}"
            type_results = cache.get(type_cache_key)

            if type_results:
                print(f"Cache hit for type {p_type}")
                # Add these results to our overall results
                for result in type_results:
                    if result["place_id"] not in processed_place_ids:
                        all_results.append(result)
                        processed_place_ids.add(result["place_id"])
                continue  # Skip API call for this type

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

                type_results = []  # Store results for this type

                if places_data.get('status') == 'OK':
                    results = places_data.get('results', [])
                    for result in results:
                        place_id = result['place_id']

                        if place_id in processed_place_ids:
                            continue
                        processed_place_ids.add(place_id)

                        # Check for cached details
                        details_cache_key = f"place_details:{place_id}"
                        details_data = cache.get(details_cache_key)

                        if not details_data:
                            details_data = self.get_place_details(place_id, api_key)
                            # Cache details for 24 hours (they don't change often)
                            cache.set(details_cache_key, details_data, 86400)

                        lat = result['geometry']['location']['lat']
                        lng = result['geometry']['location']['lng']

                        place_data = {
                            "place_id": place_id,
                            'types': result['types'],
                            "name": result.get('name'),
                            "latitude": lat,
                            "longitude": lng,
                            "vicinity": result.get('vicinity'),
                            "rating": result.get('rating'),
                            "phone_number": details_data.get('formatted_phone_number', ''),
                            "website": details_data.get('website', ''),
                        }
                        all_results.append(place_data)
                        type_results.append(place_data)

                        places_to_save.append({
                            'place_id': place_id,
                            'name': result.get('name', ''),
                            'vicinity': result.get('vicinity', ''),
                            'types': result.get('types', []),
                            'latitude': lat,
                            'longitude': lng,
                            'rating': result.get('rating'),
                            'phone_number': details_data.get('formatted_phone_number', ''),
                            'website': details_data.get('website', '')
                        })

                # Cache the results for this type (30 minutes)
                if type_results:
                    cache.set(type_cache_key, type_results, 1800)

            except requests.RequestException as e:
                return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Save places to database
        try:
            with transaction.atomic():
                for place_data in places_to_save:
                    Place.objects.update_or_create(
                        place_id=place_data['place_id'],
                        defaults=place_data
                    )
        except Exception as e:
            print(f"Error saving places to database: {str(e)}")

        # Cache the combined results (1 hour)
        cache.set(cache_key, all_results, 3600)

        return Response({"places": all_results, "cache_hit": False}, status=status.HTTP_200_OK)

    def get_place_details(self, place_id, api_key):
        """Get additional details for a place with caching"""
        cache_key = f"place_details:{place_id}"
        cached_data = cache.get(cache_key)

        if cached_data:
            return cached_data

        url = f'https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields=formatted_phone_number,website&key={api_key}'
        try:
            response = requests.get(url, timeout=10)
            data = response.json()
            if data.get('status') == 'OK' and data.get('result'):
                result = data['result']
                # Cache for 24 hours
                cache.set(cache_key, result, 86400)
                return result
        except Exception as e:
            print(f"Error fetching place details: {str(e)}")
        return {}


class EducationEventSearchView(APIView):
    def get(self, request):
        location = request.query_params.get("location")
        radius = request.query_params.get("radius", "10")
        start_date = request.query_params.get("start", None)

        if not location:
            return Response({"error": "Location parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Create cache key
        cache_key = f"education_events:{location}:{radius}"
        if start_date:
            cache_key += f":{start_date}"

        # Try to get from cache
        cached_events = cache.get(cache_key)
        if cached_events:
            print(f"Cache hit for {cache_key}")
            return Response(cached_events, status=200)

        lat, lon = map(float, location.split(','))

        if radius.replace('.', '', 1).isdigit() and not radius.endswith("km"):
            radius = int(radius) // 1000
            radius = f"{radius}km"

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

        events = [
            {
                "title": e["title"],
                "status": e["state"],
                "start": e["start"],
                "end": e["end"],
                "category": e["category"],
                "latitude": e["location"][1],
                "longitude": e["location"][0],
                "description": e.get("description", "")
            }
            for e in response.json().get("results", [])
            if e.get("location")
        ]

        # Cache events for 2 hours (event data changes more frequently)
        cache.set(cache_key, events, 7200)

        return Response(events, status=200)


def library_details(request, library_id):
    # Sanitize the library_id by URL decoding it
    library_id = unquote(library_id)

    if not library_id or library_id == 'null':
        return JsonResponse({"error": "Valid Library ID is required"}, status=400)

    # Try to get from cache
    cache_key = f"library:{library_id}"
    cached_data = cache.get(cache_key)
    is_favorite = False

    if request.user.is_authenticated:
        is_favorite = FavoriteLibrary.objects.filter(user=request.user, library_id=library_id).exists()

    if cached_data:
        print(f"Cache hit for {cache_key}")
        return render(request, 'library.html', {'library': cached_data, 'is_favorite': is_favorite})

    try:
        # Fetch from database
        lib = Place.objects.get(place_id=library_id)
        library_data = {
            "library_id": lib.place_id,
            "name": lib.name,
            "address": lib.vicinity,  # Note: change from vicinity to address for template
            "vicinity": lib.vicinity,
            "latitude": lib.latitude,
            "longitude": lib.longitude,
            "rating": lib.rating,
            "phone_number": lib.phone_number,
            "website": lib.website,
        }

        # Cache for 12 hours
        cache.set(cache_key, library_data, 43200)

        return render(request, 'library.html', {'library': library_data, 'is_favorite': is_favorite})
    except Place.DoesNotExist:
        # More detailed error message
        return JsonResponse({
            "error": f"Library with ID {library_id} not found in database",
            "details": "The place ID might be valid but not stored in our local database."
        }, status=404)
    except Exception as e:
        # Log the specific error type and message for debugging
        error_type = type(e).__name__
        error_message = str(e)
        print(f"Error in library_details: {error_type} - {error_message}")

        # Provide more helpful user message
        return JsonResponse({
            "error": "An error occurred while fetching library details",
            "details": f"Error type: {error_type}"
        }, status=500)


class BookSearchView(APIView):
    def get(self, request):
        title = request.query_params.get('title')
        author = request.query_params.get('author')

        if not author and not title:
            return Response({"error": "Please provide author or title of the book."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Create cache key
        cache_key = "books:"
        if title:
            cache_key += f"title:{title}:"
        if author:
            cache_key += f"author:{author}"

        # Try to get from cache
        cached_books = cache.get(cache_key)
        if cached_books:
            print(f"Cache hit for {cache_key}")
            return JsonResponse({"books": cached_books, "cache_hit": True})

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

        # Cache for 24 hours (book data doesn't change much)
        cache.set(cache_key, books, 86400)

        return JsonResponse({"books": books, "cache_hit": False})

@login_required
def toggle_favorite_library(request):
    if request.method == 'POST':
        library_id = request.POST.get('library_id')
        library_name = request.POST.get('library_name')
        library_address = request.POST.get('library_address')

        # Debug output
        print(f"POST data: {request.POST}")
        print(f"library_id: {library_id}")
        print(f"library_name: {library_name}")
        print(f"library_address: {library_address}")

        if not library_id or not library_name or not library_address:
            return JsonResponse({'error': 'Missing required information'}, status=400)

        try:
            # Check if this library is already a favorite
            favorite = FavoriteLibrary.objects.filter(user=request.user, library_id=library_id).first()

            if favorite:
                # If it exists, remove it (toggle off)
                favorite.delete()
                return JsonResponse({'status': 'removed', 'message': 'Library removed from favorites'})
            else:
                # If it doesn't exist, add it (toggle on)
                FavoriteLibrary.objects.create(
                    user=request.user,
                    library_id=library_id,
                    library_name=library_name,
                    library_address=library_address
                )
                return JsonResponse({'status': 'added', 'message': 'Library added to favorites'})

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Invalid request'}, status=400)
