from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class TradeMatrixException(Exception):
    def __init__(self, message: str, code: str = "BAD_REQUEST", status_code: int = 400, details: Any = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}


class DataQualityError(TradeMatrixException):
    def __init__(self, message: str, details: Any = None):
        super().__init__(message=message, code="DATA_QUALITY_ERROR", status_code=400, details=details)


class ResourceNotFoundError(TradeMatrixException):
    def __init__(self, message: str, details: Any = None):
        super().__init__(message=message, code="NOT_FOUND", status_code=404, details=details)


class PayloadTooLargeError(TradeMatrixException):
    def __init__(self, message: str, details: Any = None):
        super().__init__(message=message, code="PAYLOAD_TOO_LARGE", status_code=413, details=details)


class UpstreamDataError(TradeMatrixException):
    def __init__(self, message: str, details: Any = None):
        super().__init__(message=message, code="UPSTREAM_DATA_ERROR", status_code=502, details=details)


def format_error_response(code: str, message: str, details: Any = None, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details or {},
            }
        },
    )


async def tradematrix_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, TradeMatrixException):
        return format_error_response(
            code=exc.code,
            message=exc.message,
            details=exc.details,
            status_code=exc.status_code,
        )
    return format_error_response(
        code="BAD_REQUEST",
        message=str(exc),
        status_code=400,
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    errors = exc.errors() if hasattr(exc, "errors") else str(exc)
    return format_error_response(
        code="VALIDATION_ERROR",
        message="Request schema validation failed.",
        details=errors,
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return format_error_response(
        code="INTERNAL_SERVER_ERROR",
        message=str(exc) or "An unexpected server error occurred.",
        details={},
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
