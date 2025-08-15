#!/usr/bin/env python3
"""
Utility functions for data processing and analysis
Author: John Developer <john@example.com>
Version: 1.2.3
"""

import os
import re
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DataProcessor:
    """Main data processing class"""

    def __init__(self, config_path: str = "/etc/app/config.json"):
        self.config_path = config_path
        self.data_cache = {}
        self.processed_count = 0

    def load_config(self) -> Dict:
        """Load configuration from JSON file"""
        try:
            with open(self.config_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            logger.error(f"Config file not found: {self.config_path}")
            return {}
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in config: {e}")
            return {}

    def validate_email(self, email: str) -> bool:
        """Validate email address format"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))

    def process_user_data(self, users: List[Dict]) -> Dict:
        """Process list of user dictionaries"""
        results = {
            'total_users': len(users),
            'valid_emails': 0,
            'admin_users': 0,
            'active_users': 0
        }

        for user in users:
            # Check email validity
            if self.validate_email(user.get('email', '')):
                results['valid_emails'] += 1

            # Count admin users
            if user.get('role') == 'admin':
                results['admin_users'] += 1

            # Count active users
            if user.get('status') == 'active':
                results['active_users'] += 1

        self.processed_count += results['total_users']
        return results

def calculate_statistics(numbers: List[float]) -> Tuple[float, float, float]:
    """Calculate mean, median, and standard deviation"""
    if not numbers:
        return 0.0, 0.0, 0.0

    # Calculate mean
    mean = sum(numbers) / len(numbers)

    # Calculate median
    sorted_nums = sorted(numbers)
    n = len(sorted_nums)
    if n % 2 == 0:
        median = (sorted_nums[n//2 - 1] + sorted_nums[n//2]) / 2
    else:
        median = sorted_nums[n//2]

    # Calculate standard deviation
    variance = sum((x - mean) ** 2 for x in numbers) / len(numbers)
    std_dev = variance ** 0.5

    return mean, median, std_dev

def parse_log_file(file_path: str) -> Dict[str, int]:
    """Parse log file and count occurrences by level"""
    log_counts = defaultdict(int)

    try:
        with open(file_path, 'r') as f:
            for line in f:
                # Match log levels: INFO, ERROR, DEBUG, WARN, FATAL
                if 'ERROR' in line:
                    log_counts['ERROR'] += 1
                elif 'WARN' in line:
                    log_counts['WARN'] += 1
                elif 'INFO' in line:
                    log_counts['INFO'] += 1
                elif 'DEBUG' in line:
                    log_counts['DEBUG'] += 1
                elif 'FATAL' in line:
                    log_counts['FATAL'] += 1

    except FileNotFoundError:
        logger.error(f"Log file not found: {file_path}")

    return dict(log_counts)

class APIClient:
    """HTTP API client for external services"""

    BASE_URL = "https://api.example.com/v1"

    def __init__(self, api_key: str, timeout: int = 30):
        self.api_key = api_key
        self.timeout = timeout
        self.session_count = 0

    def get_user(self, user_id: int) -> Optional[Dict]:
        """Fetch user data by ID"""
        # Mock implementation
        return {
            'id': user_id,
            'name': f'User {user_id}',
            'email': f'user{user_id}@example.com'
        }

    def create_user(self, user_data: Dict) -> bool:
        """Create new user"""
        required_fields = ['name', 'email', 'password']

        for field in required_fields:
            if field not in user_data:
                raise ValueError(f"Missing required field: {field}")

        # Validate email
        if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', user_data['email']):
            raise ValueError("Invalid email format")

        logger.info(f"Creating user: {user_data['email']}")
        return True

# Global constants
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30
SUPPORTED_FORMATS = ['json', 'csv', 'xml']

# Sample data for testing
SAMPLE_USERS = [
    {'id': 1, 'name': 'Alice Johnson', 'email': 'alice@company.com', 'role': 'admin', 'status': 'active'},
    {'id': 2, 'name': 'Bob Smith', 'email': 'bob@company.com', 'role': 'user', 'status': 'active'},
    {'id': 3, 'name': 'Charlie Brown', 'email': 'invalid-email', 'role': 'user', 'status': 'inactive'},
    {'id': 4, 'name': 'Diana Prince', 'email': 'diana@company.com', 'role': 'admin', 'status': 'active'}
]

if __name__ == "__main__":
    # Test the data processor
    processor = DataProcessor()
    stats = processor.process_user_data(SAMPLE_USERS)
    print(f"Processing results: {stats}")

    # Test statistics calculation
    test_numbers = [1.5, 2.7, 3.1, 4.8, 5.2, 6.9, 7.3, 8.1, 9.4, 10.6]
    mean, median, std_dev = calculate_statistics(test_numbers)
    print(f"Statistics - Mean: {mean:.2f}, Median: {median:.2f}, Std Dev: {std_dev:.2f}")

    # Test API client
    client = APIClient("test_api_key_12345")
    user = client.get_user(42)
    print(f"Fetched user: {user}")
