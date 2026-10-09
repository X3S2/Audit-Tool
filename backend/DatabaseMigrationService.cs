using System.Text.Json;
using Microsoft.Data.Sqlite;
using Npgsql;

public class DatabaseMigrationService
{
    private readonly string _sqliteDbPath;
    private readonly string _postgresConnectionString;
    private readonly ILogger<DatabaseMigrationService> _logger;

    public DatabaseMigrationService(string sqliteDbPath, string postgresConnectionString, ILogger<DatabaseMigrationService> logger)
    {
        _sqliteDbPath = sqliteDbPath;
        _postgresConnectionString = postgresConnectionString;
        _logger = logger;
    }

    public async Task MigrateAsync()
    {
        try
        {
            _logger.LogInformation("Starting database migration from SQLite to PostgreSQL");

            await InitializePostgresSchema();
            await MigrateUsersTable();
            await MigrateAuditsTable();
            await MigrateLocationsTable();
            await MigrateRoomsTable();
            await MigrateObjectsTable();
            await MigrateChecklistsTable();
            await MigrateAppStateTable();

            _logger.LogInformation("Database migration completed successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Database migration failed");
            throw;
        }
    }

    private async Task InitializePostgresSchema()
    {
        using (var conn = new NpgsqlConnection(_postgresConnectionString))
        {
            await conn.OpenAsync();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(255) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        is_admin BOOLEAN DEFAULT FALSE,
                        created_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS audits (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        created_by_user_id INTEGER REFERENCES users(id),
                        start_date_utc TIMESTAMP WITH TIME ZONE,
                        end_date_utc TIMESTAMP WITH TIME ZONE,
                        status VARCHAR(50),
                        created_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS locations (
                        id SERIAL PRIMARY KEY,
                        audit_id INTEGER REFERENCES audits(id),
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        latitude FLOAT,
                        longitude FLOAT,
                        created_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS rooms (
                        id SERIAL PRIMARY KEY,
                        location_id INTEGER REFERENCES locations(id),
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        created_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS objects (
                        id SERIAL PRIMARY KEY,
                        room_id INTEGER REFERENCES rooms(id),
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        status VARCHAR(50),
                        created_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS checklists (
                        id SERIAL PRIMARY KEY,
                        audit_id INTEGER REFERENCES audits(id),
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        items_json JSONB,
                        created_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS app_state (
                        key VARCHAR(255) PRIMARY KEY,
                        value TEXT NOT NULL
                    );
                ";

                await cmd.ExecuteNonQueryAsync();
            }
        }
    }

    private async Task MigrateUsersTable()
    {
        var users = ReadFromSqlite("SELECT id, username, password_hash, is_admin FROM users");
        
        using (var conn = new NpgsqlConnection(_postgresConnectionString))
        {
            await conn.OpenAsync();
            foreach (var user in users)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "INSERT INTO users (id, username, password_hash, is_admin) VALUES (@id, @username, @password, @is_admin) ON CONFLICT DO NOTHING";
                    cmd.Parameters.AddWithValue("@id", user["id"]);
                    cmd.Parameters.AddWithValue("@username", user["username"] ?? "");
                    cmd.Parameters.AddWithValue("@password", user["password_hash"] ?? "");
                    cmd.Parameters.AddWithValue("@is_admin", user["is_admin"] ?? false);

                    await cmd.ExecuteNonQueryAsync();
                }
            }
        }

        _logger.LogInformation("Users table migrated");
    }

    private async Task MigrateAuditsTable()
    {
        var audits = ReadFromSqlite("SELECT id, name, description, created_by_user_id, start_date_utc, end_date_utc, status FROM audits");
        
        using (var conn = new NpgsqlConnection(_postgresConnectionString))
        {
            await conn.OpenAsync();
            foreach (var audit in audits)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "INSERT INTO audits (id, name, description, created_by_user_id, start_date_utc, end_date_utc, status) VALUES (@id, @name, @desc, @user_id, @start, @end, @status) ON CONFLICT DO NOTHING";
                    cmd.Parameters.AddWithValue("@id", audit["id"]);
                    cmd.Parameters.AddWithValue("@name", audit["name"] ?? "");
                    cmd.Parameters.AddWithValue("@desc", audit["description"] ?? "");
                    cmd.Parameters.AddWithValue("@user_id", audit["created_by_user_id"] ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@start", audit["start_date_utc"] ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@end", audit["end_date_utc"] ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@status", audit["status"] ?? "");

                    await cmd.ExecuteNonQueryAsync();
                }
            }
        }

        _logger.LogInformation("Audits table migrated");
    }

    private async Task MigrateLocationsTable()
    {
        var locations = ReadFromSqlite("SELECT id, audit_id, name, description, latitude, longitude FROM locations");
        
        using (var conn = new NpgsqlConnection(_postgresConnectionString))
        {
            await conn.OpenAsync();
            foreach (var loc in locations)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "INSERT INTO locations (id, audit_id, name, description, latitude, longitude) VALUES (@id, @audit_id, @name, @desc, @lat, @lon) ON CONFLICT DO NOTHING";
                    cmd.Parameters.AddWithValue("@id", loc["id"]);
                    cmd.Parameters.AddWithValue("@audit_id", loc["audit_id"] ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@name", loc["name"] ?? "");
                    cmd.Parameters.AddWithValue("@desc", loc["description"] ?? "");
                    cmd.Parameters.AddWithValue("@lat", loc["latitude"] ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@lon", loc["longitude"] ?? DBNull.Value);

                    await cmd.ExecuteNonQueryAsync();
                }
            }
        }

        _logger.LogInformation("Locations table migrated");
    }

    private async Task MigrateRoomsTable()
    {
        var rooms = ReadFromSqlite("SELECT id, location_id, name, description FROM rooms");
        
        using (var conn = new NpgsqlConnection(_postgresConnectionString))
        {
            await conn.OpenAsync();
            foreach (var room in rooms)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "INSERT INTO rooms (id, location_id, name, description) VALUES (@id, @loc_id, @name, @desc) ON CONFLICT DO NOTHING";
                    cmd.Parameters.AddWithValue("@id", room["id"]);
                    cmd.Parameters.AddWithValue("@loc_id", room["location_id"] ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@name", room["name"] ?? "");
                    cmd.Parameters.AddWithValue("@desc", room["description"] ?? "");

                    await cmd.ExecuteNonQueryAsync();
                }
            }
        }

        _logger.LogInformation("Rooms table migrated");
    }

    private async Task MigrateObjectsTable()
    {
        var objects = ReadFromSqlite("SELECT id, room_id, name, description, status FROM objects");
        
        using (var conn = new NpgsqlConnection(_postgresConnectionString))
        {
            await conn.OpenAsync();
            foreach (var obj in objects)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "INSERT INTO objects (id, room_id, name, description, status) VALUES (@id, @room_id, @name, @desc, @status) ON CONFLICT DO NOTHING";
                    cmd.Parameters.AddWithValue("@id", obj["id"]);
                    cmd.Parameters.AddWithValue("@room_id", obj["room_id"] ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@name", obj["name"] ?? "");
                    cmd.Parameters.AddWithValue("@desc", obj["description"] ?? "");
                    cmd.Parameters.AddWithValue("@status", obj["status"] ?? "");

                    await cmd.ExecuteNonQueryAsync();
                }
            }
        }

        _logger.LogInformation("Objects table migrated");
    }

    private async Task MigrateChecklistsTable()
    {
        var checklists = ReadFromSqlite("SELECT id, audit_id, name, description, items_json FROM checklists");
        
        using (var conn = new NpgsqlConnection(_postgresConnectionString))
        {
            await conn.OpenAsync();
            foreach (var checklist in checklists)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "INSERT INTO checklists (id, audit_id, name, description, items_json) VALUES (@id, @audit_id, @name, @desc, @items::jsonb) ON CONFLICT DO NOTHING";
                    cmd.Parameters.AddWithValue("@id", checklist["id"]);
                    cmd.Parameters.AddWithValue("@audit_id", checklist["audit_id"] ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@name", checklist["name"] ?? "");
                    cmd.Parameters.AddWithValue("@desc", checklist["description"] ?? "");
                    cmd.Parameters.AddWithValue("@items", checklist["items_json"] ?? "{}");

                    await cmd.ExecuteNonQueryAsync();
                }
            }
        }

        _logger.LogInformation("Checklists table migrated");
    }

    private async Task MigrateAppStateTable()
    {
        var states = ReadFromSqlite("SELECT key, value FROM app_state");
        
        using (var conn = new NpgsqlConnection(_postgresConnectionString))
        {
            await conn.OpenAsync();
            foreach (var state in states)
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "INSERT INTO app_state (key, value) VALUES (@key, @value) ON CONFLICT DO NOTHING";
                    cmd.Parameters.AddWithValue("@key", state["key"] ?? "");
                    cmd.Parameters.AddWithValue("@value", state["value"] ?? "");

                    await cmd.ExecuteNonQueryAsync();
                }
            }
        }

        _logger.LogInformation("App state table migrated");
    }

    private List<Dictionary<string, object>> ReadFromSqlite(string query)
    {
        var results = new List<Dictionary<string, object>>();

        using (var conn = new SqliteConnection($"Data Source={_sqliteDbPath}"))
        {
            conn.Open();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = query;
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        var row = new Dictionary<string, object>();
                        for (int i = 0; i < reader.FieldCount; i++)
                        {
                            row[reader.GetName(i)] = reader.GetValue(i);
                        }
                        results.Add(row);
                    }
                }
            }
        }

        return results;
    }
}
