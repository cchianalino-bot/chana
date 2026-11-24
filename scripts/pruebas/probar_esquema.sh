#!/usr/bin/env bash
# Levanta un PostgreSQL temporal, aplica la migración y el seed, carga el CSV
# migrado y corre las pruebas de pruebas.sql.
#
#   scripts/pruebas/probar_esquema.sh salida/movimientos_migrados.csv
set -euo pipefail

CSV="$(realpath "${1:?Uso: probar_esquema.sh movimientos_migrados.csv}")"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v postgres 2>/dev/null || ls /usr/lib/postgresql/*/bin/postgres | tail -1)")}"
DATOS="$(mktemp -d)"
PUERTO=54329

if [ "$(id -u)" = "0" ]; then
    chown -R postgres "$DATOS"
    COMO=(su postgres -c)
else
    COMO=(bash -c)
fi

limpiar() {
    "${COMO[@]}" "'$PG_BIN/pg_ctl' -D '$DATOS' stop -m fast" >/dev/null 2>&1 || true
    rm -rf "$DATOS"
}
trap limpiar EXIT

"${COMO[@]}" "'$PG_BIN/initdb' -D '$DATOS' -U postgres -A trust >/dev/null"
"${COMO[@]}" "'$PG_BIN/pg_ctl' -D '$DATOS' -o '-p $PUERTO -k /tmp' -l '$DATOS/log' start -w >/dev/null"

PSQL=(psql -h /tmp -p "$PUERTO" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$RAIZ/scripts/pruebas/auth_stub.sql"
for f in "$RAIZ"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$RAIZ/supabase/seed.sql"
"${PSQL[@]}" -f "$RAIZ/scripts/pruebas/pruebas.sql" < "$CSV"
