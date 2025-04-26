from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.http import JsonResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import requests

from api.models import Place


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
                    for result in results:
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

        return Response({"places": all_results}, status=status.HTTP_200_OK)


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

        return Response(events, status=200)

def library(request):
    library_data = {
        "library_id": "nanaaaa",
        "name": "lib.name",
        "address": "lib.vicinity"
    }
    return render(request, 'library.html', {'library_data': library_data})

def library_details(request,library_id):
    # library_id = request.GET.get("id")
    # print("Library ID:", library_id)
    if not library_id:
        return JsonResponse({"error": "Library ID is required"}, status=400)

    try:
        # Fetch the library details from the database
        lib = Place.objects.get(place_id=library_id)
        library_data = {
            "library_id": lib.place_id,
            "name": lib.name,
            "address": lib.vicinity,
            # "facilities": lib.facilities.split(",")  # Assuming facilities are stored as a comma-separated string
        }
        return render(request, 'library.html', {'library': library_data})
        # return JsonResponse(library_data, status=200)
    except Place.DoesNotExist:
        return JsonResponse({"error": "Library not found"}, status=404)

class BookSearchView(APIView):
    def get(self, request):
        # library_id = request.GET.get("library_id")
        title = request.query_params.get('title')
        author = request.query_params.get('author')
        # print("Title:", title,author)
        # if not library_id:
        #     return JsonResponse({"error": "Library ID is required"}, status=400)

        if not author and not title:
            return Response({"error": "Please provide author or title of the book."},
                            status=status.HTTP_400_BAD_REQUEST)

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

        return JsonResponse({"books": books})


@login_required
def toggle_favorite_library(request):
    if request.method == 'POST':
        return JsonResponse({'error': 'Database functionality removed'}, status=400)

    return JsonResponse({'error': 'Invalid request'}, status=400)