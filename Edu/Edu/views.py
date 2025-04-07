from django.shortcuts import render

def nearby_search_map(request):
    return render(request, 'nearby_search.html')