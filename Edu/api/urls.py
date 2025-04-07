from django.urls import path
from .views import NearbySearchView,BookSearchView,EducationEventSearchView,place_details

urlpatterns = [
    path('place-details/', place_details, name='place-details'),
    path('nearby-search/', NearbySearchView.as_view(), name='nearby-search'),
    path('search-books/', BookSearchView.as_view(), name='search-books'),
    path("events/education/", EducationEventSearchView.as_view(), name="education-events"),
]