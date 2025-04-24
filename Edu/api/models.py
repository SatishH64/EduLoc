from django.db import models
from django.contrib.auth.models import User
from django.contrib.postgres.fields import ArrayField


class FavoriteLibrary(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='favorite_libraries')
    library_name = models.CharField(max_length=255)
    library_address = models.TextField()
    library_id = models.CharField(max_length=255,
                                  unique=True)  # Unique identifier for the library (e.g., Google Place ID)

    def __str__(self):
        return f"{self.user.username} - {self.library_name}"


class Place(models.Model):
    place_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    vicinity = models.TextField(null=True, blank=True)
    types = models.CharField(max_length=255, null=True, blank=True)
    location = models.JSONField()
    # latitude = models.FloatField()
    # longitude = models.FloatField()
    rating = models.FloatField(null=True, blank=True)
    # open_now = models.BooleanField(null=True, blank=True)
    phone_number = models.CharField(max_length=50, null=True, blank=True)
    website = models.URLField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class EducationEvent(models.Model):
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=50)
    start = models.DateTimeField()
    end = models.DateTimeField(null=True, blank=True)
    category = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

#
# class Book(models.Model):
#     title = models.CharField(max_length=255)
#     author = models.CharField(max_length=255)
#     cover_url = models.URLField(null=True, blank=True)
#     first_publish_year = models.IntegerField(null=True, blank=True)
#     key = models.CharField(max_length=255, unique=True)
#     created_at = models.DateTimeField(auto_now_add=True)
#     updated_at = models.DateTimeField(auto_now=True)
