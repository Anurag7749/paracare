class APIException(Exception):
    """Base API Exception."""
    def __init__(self, message, status_code=400, error_code="BAD_REQUEST", details=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details

class ValidationError(APIException):
    def __init__(self, message="Validation failed", details=None):
        super().__init__(message, status_code=400, error_code="VALIDATION_ERROR", details=details)

class UnauthorizedError(APIException):
    def __init__(self, message="Unauthorized access", details=None):
        super().__init__(message, status_code=401, error_code="UNAUTHORIZED", details=details)

class ForbiddenError(APIException):
    def __init__(self, message="Access forbidden", details=None):
        super().__init__(message, status_code=403, error_code="FORBIDDEN", details=details)

class NotFoundError(APIException):
    def __init__(self, message="Resource not found", details=None):
        super().__init__(message, status_code=404, error_code="NOT_FOUND", details=details)

class DatabaseError(APIException):
    def __init__(self, message="Database operation failed", details=None):
        super().__init__(message, status_code=500, error_code="DATABASE_ERROR", details=details)
