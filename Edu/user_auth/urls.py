from django.urls import path
from . import views

urlpatterns = [
    path('login/', views.login_register_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('user_profile/', views.user_profile, name='user_profile'),
    path('login_register/', views.login_register, name='login_register'),  # New URL
]