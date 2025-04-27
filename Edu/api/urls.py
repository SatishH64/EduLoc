from django.urls import path
from .views import *

urlpatterns = [
    path('index/', index, name='index'),
    path('toggle-favorite-library/', toggle_favorite_library, name='toggle_favorite_library'),
    # path('place-details/', place_details, name='place-details'),
    path('nearby-search/', NearbySearchView.as_view(), name='nearby-search'),
    path('search-books/', BookSearchView.as_view(), name='search-books'),
    path("events/education/", EducationEventSearchView.as_view(), name="education-events"),
    # path("library/", library, name="library"),
    path("library-details/<str:library_id>/", library_details, name="library-details"),
]