from django.utils.deprecation import MiddlewareMixin
import time


class CacheMonitorMiddleware(MiddlewareMixin):
    def process_request(self, request):
        request.start_time = time.time()

    def process_response(self, request, response):
        if hasattr(request, 'start_time'):
            duration = time.time() - request.start_time

            # Check if response came from cache
            is_cached = hasattr(response, 'from_cache') or \
                        (isinstance(response.content, bytes) and b'"cache_hit": true' in response.content)

            # Add performance headers
            response['X-Response-Time'] = f'{duration:.4f}s'
            if is_cached:
                response['X-Cache'] = 'HIT'
            else:
                response['X-Cache'] = 'MISS'

        return response