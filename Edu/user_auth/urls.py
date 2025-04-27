from django.urls import path
from . import views

urlpatterns = [
    path('login/', views.login_register_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('profile/', views.user_profile, name='user_profile'),
    path('register/', views.login_register, name='login_register'),  # New URL
]