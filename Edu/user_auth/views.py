from django.db import transaction
from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages

from Edu import settings
from api.models import FavoriteLibrary
from .forms import UserEditForm, UserProfileEditForm
from .models import UserProfile


def login_register(request):
    if request.user.is_authenticated:
        print("User already logged in!")
        return redirect('user_profile')
    return render(request, 'login_register.html')


def login_register_view(request):
    if request.method == 'POST':
        if 'confirm_create' in request.POST:

            print("POST data for account creation:", request.POST)
            # Handle account creation
            username = request.POST['username']
            password = request.POST['password']
            email = request.POST['email']

            if User.objects.filter(username=username).exists():
                messages.error(request, "User already exists!")
                return redirect('login')

            # Create the user
            user = User.objects.create_user(username=username, password=password, email=email)
            user.save()
            messages.success(request, "Account created successfully! Please log in.")
            return redirect('login')

        # Handle login
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request, username=username, password=password)

        if user is not None:
            login(request, user)
            return redirect('index')
        else:
            if not User.objects.filter(username=username).exists():
                return render(request, 'login_register.html', {
                    'show_register_modal': True,
                    'username': username,
                    'password': password
                })

            messages.error(request, "Invalid username or password!")
            return redirect('login')

    return redirect('index')

    # return render(request, 'map1.html')


def logout_view(request):
    logout(request)
    messages.success(request, "Logged out successfully!")
    return redirect('login')


@login_required
def user_profile(request):
    user = request.user

    # Ensure the user has a profile
    if not hasattr(user, 'profile'):
        UserProfile.objects.create(user=user)

    # Get user's favorite libraries
    favorite_libraries = FavoriteLibrary.objects.filter(user=user)

    if request.method == 'POST':
        try:
            with transaction.atomic():
                # Update User model fields
                user.first_name = request.POST.get('first_name', '')
                user.last_name = request.POST.get('last_name', '')
                user.email = request.POST.get('email', '')
                user.save()

                # Update UserProfile fields
                profile = user.profile
                profile.phone_number = request.POST.get('phone_number', '')
                profile.gender = request.POST.get('gender', '')
                profile.address = request.POST.get('address', '')
                profile.save()

                messages.success(request, 'Your profile has been updated successfully!')
                return redirect('user_profile')
        except Exception as e:
            messages.error(request, f'Error updating profile: {str(e)}')

    return render(request, 'user_profile.html', {
        'user': user,
        'favorite_libraries': favorite_libraries,
        # You can add these if you implement them later
        'favorite_books': [],
        'favorite_events': []
    })


@login_required
def edit_user_profile(request):
    user = request.user
    profile, created = UserProfile.objects.get_or_create(user=user)

    if request.method == 'POST':
        user_form = UserEditForm(request.POST, instance=user)
        profile_form = UserProfileEditForm(request.POST, instance=profile)

        if user_form.is_valid() and profile_form.is_valid():
            user_form.save()
            profile_form.save()
            messages.success(request, "Profile updated successfully!")
            return redirect('user_profile')
    else:
        user_form = UserEditForm(instance=user)
        profile_form = UserProfileEditForm(instance=profile)

    return render(request, 'user_profile.html', {'user_form': user_form, 'profile_form': profile_form})
