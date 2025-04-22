from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
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
            return redirect('user_profile')
        else:
            if not User.objects.filter(username=username).exists():
                return render(request, 'login_register.html', {
                    'show_register_modal': True,
                    'username': username,
                    'password': password
                })

            messages.error(request, "Invalid username or password!")
            return redirect('login')

    return render(request, 'index.html')

    # return render(request, 'map1.html')

def logout_view(request):
    logout(request)
    messages.success(request, "Logged out successfully!")
    return redirect('login')

@login_required
def user_profile(request):
    return render(request, 'user_profile.html')

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