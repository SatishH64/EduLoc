from django.core.management.base import BaseCommand
from django.core.cache import cache
import time

class Command(BaseCommand):
    help = 'Clears stale cache entries'

    def add_arguments(self, parser):
        parser.add_argument(
            '--all',
            action='store_true',
            help='Clear all cache instead of just stale entries',
        )

    def handle(self, *args, **options):
        try:
            if options['all']:
                cache.clear()
                self.stdout.write(
                    self.style.SUCCESS('Successfully cleared all cache entries')
                )
            else:
                # For database cache, Django doesn't have a built-in way to clear only stale entries
                # We can query the database directly if needed
                from django.db import connections
                cursor = connections['default'].cursor()
                # Delete expired entries (current time > expire_date)
                cursor.execute(
                    "DELETE FROM django_cache_table WHERE expire_date < %s",
                    [time.time()]
                )
                count = cursor.rowcount
                self.stdout.write(
                    self.style.SUCCESS(f'Successfully cleared {count} stale cache entries')
                )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error clearing cache: {str(e)}')
            )