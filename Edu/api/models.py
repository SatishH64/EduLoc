from django.db import models
from django.contrib.auth.models import User

class FavoriteLibrary(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='favorite_libraries')
    library_name = models.CharField(max_length=255)
    library_address = models.TextField()
    library_id = models.CharField(max_length=255, unique=True)  # Unique identifier for the library (e.g., Google Place ID)

    def __str__(self):
        return f"{self.user.username} - {self.library_name}"