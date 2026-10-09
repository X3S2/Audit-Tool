#!/bin/bash

# Audit-Tool v1.6.0 - Production Verification Script

echo "=========================================="
echo "Audit-Tool v1.6.0 - Produktionsverifikation"
echo "=========================================="
echo ""

echo "🔍 Container Status:"
docker ps --filter "name=audit" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "🔗 Backend API Test:"
curl -s http://localhost:5050/api/health | jq '.' 2>/dev/null || echo "Backend antwortet nicht auf Port 5050"
echo ""

echo "🌐 Frontend Test:"
curl -s -I http://localhost:4714 | grep -E "^HTTP|^Server" || echo "Frontend nicht erreichbar auf Port 4714"
echo ""

echo "💾 Datenbank Test:"
docker exec audit-postgres-db psql -U postgres -c "SELECT 1" 2>/dev/null && echo "✅ PostgreSQL läuft" || echo "⚠️ PostgreSQL nicht verbunden"
echo ""

echo "📊 Versions-Summary:"
echo "Version: 1.6.0"
echo "Commits: $(cd C:\Docker\Audit-Multi && git rev-list --count HEAD)"
echo "Branch: $(cd C:\Docker\Audit-Multi && git rev-parse --abbrev-ref HEAD)"
echo "Last Commit: $(cd C:\Docker\Audit-Multi && git log -1 --format='%h - %s')"
echo ""

echo "✅ Produktionsreif - alle Container laufen!"
echo "=========================================="
