from django.contrib.auth.backends import ModelBackend
from django.contrib.auth.models import User

class WebsiteUserBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        try:
            user = User.objects.get(username=username)
            # Ensure the user is not a staff or superuser (admin users)
            if not user.is_staff and not user.is_superuser and user.check_password(password):
                return user
        except User.DoesNotExist:
            return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None