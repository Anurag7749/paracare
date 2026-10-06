def test_health_check_endpoint_structure(client):
    """Test that GET /api/health responds with correct JSON structure."""
    response = client.get('/api/health')
    assert response.status_code in (200, 503)
    json_data = response.get_json()
    assert "success" in json_data
    if response.status_code == 200:
        assert json_data["success"] is True
        assert "data" in json_data
        assert "backend_status" in json_data["data"]
        assert json_data["data"]["backend_status"] == "healthy"
        assert "database_status" in json_data["data"]
        assert "timestamp" in json_data["data"]
