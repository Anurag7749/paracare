def format_pagination(items, page, per_page, total):
    """Utility schema helper for paginated JSON output."""
    return {
        "items": [item.to_dict() if hasattr(item, 'to_dict') else item for item in items],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "pages": (total + per_page - 1) // per_page if per_page else 1
        }
    }
