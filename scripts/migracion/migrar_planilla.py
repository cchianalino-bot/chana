#!/usr/bin/env python3
"""
Migra la planilla histórica de finanzas (formato "a lo ancho": un concepto por
fila y un mes por columna) al formato de la hoja "Movimientos" (una fila por
movimiento), que es la que lee el botón Sincronizar de la app.

Uso:
    python3 migrar_planilla.py planilla.xlsx --desde 2025-10 --hasta 2026-11 --salida salida/

Genera:
    movimientos_migrados.csv   filas listas para la hoja "Movimientos"
    reporte_migracion.md       qué se migró, ajustes y diferencias a revisar

Criterios:
  * La hoja "Gastos" es el resumen mensual y manda en los totales.
  * Si un concepto del resumen tiene hoja de detalle (Comida, Auto, Otros gastos,
    Ingresos Carli, TC Meli/TC Carli), se migra el detalle. Si el detalle no
    suma lo mismo que el resumen, la diferencia se carga como un movimiento
    "Ajuste conciliación con resumen" y queda listada en el reporte.
  * Si en un mes no hay columna de detalle, se usa el valor del resumen.
  * Solo se migran los meses entre --desde y --hasta: los meses posteriores de
    la planilla son proyecciones.
"""

import argparse
import csv
import datetime as dt
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import openpyxl

COLUMNAS = [
    "Fecha", "Tipo", "Grupo", "Subgrupo", "Concepto", "Monto",
    "Cuotas", "Mes 1ra cuota", "Medio de pago", "Quién",
]

# Tipo de cada grupo (el resto son gastos). En la planilla los ingresos y las
# inversiones van con su signo; los gastos, en negativo.
TIPO_GRUPO = {"Ingresos": "Ingreso", "Inversiones": "Inversión"}
GRUPOS_CON_SIGNO = set(TIPO_GRUPO)

CONCEPTO_AJUSTE = "Ajuste conciliación con resumen"
TOLERANCIA = 1.0  # pesos; diferencias menores se consideran redondeo

# -----------------------------------------------------------------------------
# Mapeos de la planilla al catálogo de grupos/subgrupos (supabase/seed.sql)
# -----------------------------------------------------------------------------

# Conceptos del resumen (hoja "Gastos"). Un valor None indica que el concepto
# se migra desde su hoja de detalle.
RESUMEN = {
    "Sueldo Meli":        ("Ingresos", "Sueldo Meli", "Meli"),
    "Ingresos Carli":     None,
    "Otros ingresos":     ("Ingresos", "Otros ingresos", "Ambos"),
    "Inversiones":        ("Inversiones", "Inversiones", "Ambos"),
    "Sueldo empleada":    ("Hogar", "Sueldo empleada", "Ambos"),
    "Tarjetas":           None,
    "Huerto":             ("Chicos y actividades", "Huerto", "Ambos"),
    "Danza":              ("Chicos y actividades", "Danza", "Ambos"),
    "Gimnasia Artistica": ("Chicos y actividades", "Gimnasia artística", "Ambos"),
    "Academia":           ("Chicos y actividades", "Academia", "Ambos"),
    "Tenis":              ("Chicos y actividades", "Tenis", "Ambos"),
    "Ingles":             ("Chicos y actividades", "Inglés", "Ambos"),
    "Futbol":             ("Chicos y actividades", "Fútbol", "Ambos"),
    "Gastos Demyn":       ("Trabajo", "Gastos Demyn", "Carli"),
    "Gas":                ("Hogar", "Gas", "Ambos"),
    "Sudecor":            ("Hogar", "Sudecor", "Ambos"),
    "Expensas":           ("Hogar", "Expensas", "Ambos"),
    "Monotributo":        ("Impuestos", "Monotributo", "Ambos"),
    "Epec":               ("Hogar", "Epec", "Ambos"),
    "Comida":             None,
    "Auto":               None,
    "Ropa":               ("Otros", "Ropa", "Ambos"),
    "Salida":             ("Salidas", "General", "Ambos"),
    "Otros Gastos":       None,
    "Construccion":       ("Hogar", "Construcción", "Ambos"),
    "Prestamo 1":         ("Préstamos", "Préstamos vigentes", "Ambos"),
    "Prestamo 2":         ("Préstamos", "Préstamos vigentes", "Ambos"),
    "Prestamo 3":         ("Préstamos", "Préstamos vigentes", "Ambos"),
}

COMIDA = {
    "carniceria": "Carnicería", "despensa": "Despensa", "comida banco": "Comida banco",
    "fiambreria": "Fiambrería", "sodero": "Sodero", "verduleria": "Verdulería",
    "super": "Super", "merienda": "Merienda", "pastas": "Pastas",
    "dietetica": "Dietética", "escabeche": "Escabeche", "panaderia": "Panadería",
    "congeladors": "Congelados", "carlini": "Carlini", "pollo": "Pollo",
    "empanadas": "Empanadas",
}

AUTO = {
    "nafta": "Nafta", "estacionamiento": "Estacionamiento", "multa": "Multas",
    "arregla optica": "Service y arreglos", "cambio de aceite": "Service y arreglos",
    "auto nuevo": "Auto nuevo",
}

OTROS_GASTOS = {
    "regalos":            ("Salidas", "Regalos"),
    "uñas":               ("Salud y cuidado personal", "Uñas"),
    "sorteos":            ("Otros", "Sorteos"),
    "depilacion":         ("Salud y cuidado personal", "Depilación"),
    "viaje carli":        ("Salidas", "Viajes"),
    "viaje feli":         ("Chicos y actividades", "Viajes"),
    "librería":           ("Chicos y actividades", "Librería"),
    "??":                 ("Otros", "Sin identificar"),
    "leña":               ("Hogar", "Leña"),
    "limpieza":           ("Hogar", "Limpieza"),
    "dermatologa":        ("Salud y cuidado personal", "Dermatóloga"),
    "video danza":        ("Chicos y actividades", "Danza"),
    "farmacia":           ("Salud y cuidado personal", "Farmacia"),
    "medico":             ("Salud y cuidado personal", "Médico"),
    "comida perros":      ("Hogar", "Mascotas"),
    "rentas":             ("Impuestos", "Rentas"),
    "afip":               ("Impuestos", "AFIP / ARCA"),
    "cumple isa":         ("Chicos y actividades", "Cumpleaños"),
    "juguetes":           ("Chicos y actividades", "Juguetes"),
    "fin de año escuela": ("Chicos y actividades", "Escuela"),
}

# Hojas de tarjeta: las columnas son resúmenes mensuales desde abril 2025.
# Algunos encabezados tienen la fecha mal tipeada, así que el mes se toma por
# la posición de la columna y no por el texto del encabezado.
TARJETAS = {"TC Meli": "Meli", "TC Carli": "Carli"}
TARJETAS_PRIMER_MES = dt.date(2025, 4, 1)


# -----------------------------------------------------------------------------
# Utilidades
# -----------------------------------------------------------------------------

@dataclass
class Fila:
    periodo: dt.date
    grupo: str
    subgrupo: str
    concepto: str
    monto: float
    medio: str = "Sin especificar"
    quien: str = "Ambos"

    @property
    def tipo(self):
        return TIPO_GRUPO.get(self.grupo, "Gasto")

    @property
    def efecto_en_saldo(self):
        return -self.monto if self.tipo == "Gasto" else self.monto


def clave(texto):
    return str(texto).strip().lower()


def es_numero(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def a_mes(v):
    if isinstance(v, (dt.datetime, dt.date)):
        return dt.date(v.year, v.month, 1)
    return None


def sumar_meses(fecha, n):
    total = fecha.year * 12 + fecha.month - 1 + n
    return dt.date(total // 12, total % 12 + 1, 1)


def parse_mes(texto):
    anio, mes = texto.split("-")
    return dt.date(int(anio), int(mes), 1)


def columnas_por_mes(ws):
    """{indice_columna: mes} según los encabezados con fecha de la fila 1."""
    return {
        i: a_mes(c.value)
        for i, c in enumerate(ws[1])
        if a_mes(c.value) is not None
    }


def leer_filas(ws, cols, hasta_concepto=None):
    """Recorre las filas de detalle: (nro_fila, concepto, {mes: valor})."""
    for nro, fila in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        concepto = fila[0]
        if concepto is None:
            continue
        if hasta_concepto and clave(concepto) in hasta_concepto:
            break
        valores = {
            mes: fila[i] for i, mes in cols.items()
            if i < len(fila) and es_numero(fila[i]) and fila[i] != 0
        }
        yield nro, str(concepto).strip(), valores


# -----------------------------------------------------------------------------
# Migración
# -----------------------------------------------------------------------------

class Migracion:
    def __init__(self, wb, desde, hasta):
        self.wb = wb
        self.desde = desde
        self.hasta = hasta
        self.filas = []
        self.ajustes = []       # (mes, concepto resumen, resumen, detalle, diferencia)
        self.hallazgos = []     # errores de la planilla que no se copiaron
        self.sin_detalle = []   # (mes, concepto) migrados con el total del resumen
        self.avisos = []

    def en_rango(self, mes):
        return self.desde <= mes <= self.hasta

    def agregar(self, fila):
        if self.en_rango(fila.periodo) and round(fila.monto, 2) != 0:
            self.filas.append(fila)

    # -- resumen ----------------------------------------------------------------

    def leer_resumen(self):
        ws = self.wb["Gastos"]
        cols = columnas_por_mes(ws)
        resumen = {}
        for nro, fila in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            concepto = fila[0]
            if concepto is None:
                continue
            concepto = str(concepto).strip()
            if concepto == "TOTALES":
                self.totales = {mes: fila[i] for i, mes in cols.items() if es_numero(fila[i])}
                break
            resumen[concepto] = {
                mes: fila[i] for i, mes in cols.items() if es_numero(fila[i]) and fila[i] != 0
            }
        return resumen

    def migrar(self):
        resumen = self.leer_resumen()

        for concepto, valores in resumen.items():
            if concepto not in RESUMEN:
                self.avisos.append(
                    f"Concepto del resumen sin clasificar: '{concepto}'. Se migró a Otros / General."
                )
                destino = ("Otros", "General", "Ambos")
            else:
                destino = RESUMEN[concepto]

            if destino is None:
                continue  # se migra desde su hoja de detalle

            grupo, subgrupo, quien = destino
            signo = 1 if grupo in GRUPOS_CON_SIGNO else -1
            for mes, valor in valores.items():
                if signo < 0 and valor > 0 and self.en_rango(mes):
                    self.avisos.append(
                        f"{mes:%m/%Y} · '{concepto}' figura en positivo en el resumen; se migró "
                        "como un reintegro (gasto negativo). Revisar si es un error de signo."
                    )
                self.agregar(Fila(mes, grupo, subgrupo, concepto, signo * valor, quien=quien))

        self.migrar_detalle(resumen, "Comida", "Comida", self.filas_comida)
        self.migrar_detalle(resumen, "Auto", "Auto", self.filas_auto)
        self.migrar_detalle(resumen, "Otros Gastos", "Otros gastos", self.filas_otros_gastos)
        self.migrar_detalle(resumen, "Ingresos Carli", "Ingresos Carli", self.filas_ingresos_carli)
        self.migrar_tarjetas(resumen)

    def migrar_detalle(self, resumen, concepto_resumen, hoja, generador):
        """Migra una hoja de detalle y concilia cada mes contra el resumen."""
        grupo_ajuste, subgrupo_ajuste, quien_ajuste = {
            "Comida":         ("Comida", "General", "Ambos"),
            "Auto":           ("Auto", "General", "Ambos"),
            "Otros Gastos":   ("Otros", "General", "Ambos"),
            "Ingresos Carli": ("Ingresos", "Ingresos Carli", "Carli"),
        }[concepto_resumen]
        signo = 1 if grupo_ajuste in GRUPOS_CON_SIGNO else -1

        ws = self.wb[hoja]
        cols = columnas_por_mes(ws)
        meses_detalle = set(cols.values())

        por_mes = defaultdict(float)
        for fila in generador(ws, cols):
            self.agregar(fila)
            por_mes[fila.periodo] += fila.efecto_en_saldo

        valores_resumen = resumen.get(concepto_resumen, {})
        for mes in sorted(set(valores_resumen) | set(por_mes)):
            if not self.en_rango(mes):
                continue
            esperado = valores_resumen.get(mes, 0)
            if mes not in meses_detalle or por_mes[mes] == 0:
                # Sin detalle para ese mes: se usa el total del resumen.
                self.sin_detalle.append((mes, concepto_resumen))
                self.agregar(Fila(mes, grupo_ajuste, subgrupo_ajuste, concepto_resumen,
                                  signo * esperado, quien=quien_ajuste))
                continue
            if abs(esperado + por_mes[mes]) <= TOLERANCIA and abs(esperado) > TOLERANCIA:
                # Mismo importe con el signo invertido: error de la planilla, no se copia.
                self.hallazgos.append(
                    f"**{mes:%m/%Y} · {concepto_resumen}:** en el resumen figura en positivo "
                    f"({pesos(esperado)}), o sea que la planilla lo sumó como ingreso. Se migró "
                    f"el detalle como gasto ({pesos(signo * por_mes[mes])}); el saldo real del mes "
                    f"es {pesos(2 * abs(esperado))} menor que el de la planilla."
                )
                continue
            diferencia = esperado - por_mes[mes]
            if abs(diferencia) > TOLERANCIA:
                self.ajustes.append((mes, concepto_resumen, signo * esperado,
                                     signo * por_mes[mes], signo * diferencia))
                self.agregar(Fila(mes, grupo_ajuste, subgrupo_ajuste, CONCEPTO_AJUSTE,
                                  signo * diferencia, quien=quien_ajuste))

    # -- hojas de detalle -------------------------------------------------------

    def filas_comida(self, ws, cols):
        for nro, concepto, valores in leer_filas(ws, cols):
            k = clave(concepto)
            if k == "concepto":
                continue
            if k == "gastos cheques":
                grupo, subgrupo = "Otros", "Gastos cheques"
            elif k in COMIDA:
                grupo, subgrupo = "Comida", COMIDA[k]
            else:
                self.avisos.append(f"Comida: '{concepto}' sin subgrupo, se migró a Comida / General.")
                grupo, subgrupo = "Comida", "General"
            for mes, valor in valores.items():
                yield Fila(mes, grupo, subgrupo, concepto, valor)

    def filas_auto(self, ws, cols):
        for nro, concepto, valores in leer_filas(ws, cols):
            subgrupo = AUTO.get(clave(concepto))
            if subgrupo is None:
                self.avisos.append(f"Auto: '{concepto}' sin subgrupo, se migró a Auto / General.")
                subgrupo = "General"
            for mes, valor in valores.items():
                yield Fila(mes, "Auto", subgrupo, concepto, valor)

    def filas_otros_gastos(self, ws, cols):
        for nro, concepto, valores in leer_filas(ws, cols):
            k = clave(concepto)
            if k == "concepto":
                continue
            destino = OTROS_GASTOS.get(k)
            if destino is None:
                self.avisos.append(f"Otros gastos: '{concepto}' sin subgrupo, se migró a Otros / General.")
                destino = ("Otros", "General")
            for mes, valor in valores.items():
                yield Fila(mes, *destino, concepto, valor)

    def filas_ingresos_carli(self, ws, cols):
        en_clientes = True
        for nro, concepto, valores in leer_filas(ws, cols, hasta_concepto={"total sin vir"}):
            k = clave(concepto)
            if k == "cliente":
                continue
            if k == "total ingresos":
                en_clientes = False
                continue
            for mes, valor in valores.items():
                if en_clientes:
                    yield Fila(mes, "Ingresos", "Ingresos Carli", concepto, valor, quien="Carli")
                elif k == "diseñadoras":
                    yield Fila(mes, "Trabajo", "Diseñadoras", concepto, -valor, quien="Carli")
                elif k == "gastos cheques":
                    yield Fila(mes, "Otros", "Gastos cheques", concepto, -valor, quien="Carli")
                else:
                    self.avisos.append(f"Ingresos Carli: fila '{concepto}' no reconocida, no se migró.")

    def migrar_tarjetas(self, resumen):
        """Consumos y cargos de cada tarjeta, conciliados contra 'Tarjetas' del resumen."""
        por_mes = defaultdict(float)
        for hoja, titular in TARJETAS.items():
            ws = self.wb[hoja]
            medio = hoja
            cols = {
                i: sumar_meses(TARJETAS_PRIMER_MES, i - 1)
                for i in range(1, ws.max_column)
            }
            totales_vistos = 0
            for nro, fila in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                concepto = fila[0]
                if concepto is not None and clave(concepto) == "total":
                    totales_vistos += 1
                    if totales_vistos == 2:
                        break
                    continue
                valores = {
                    mes: fila[i] for i, mes in cols.items()
                    if i < len(fila) and es_numero(fila[i]) and fila[i] != 0
                }
                if not valores:
                    continue
                nombre = str(concepto).strip() if concepto is not None else f"Sin nombre (fila {nro})"
                if totales_vistos == 0:
                    grupo, subgrupo = "Sin clasificar", "Consumos tarjeta (histórico)"
                else:
                    grupo, subgrupo = "Impuestos", "Impuestos tarjeta"
                for mes, valor in valores.items():
                    fila_mov = Fila(mes, grupo, subgrupo, nombre, valor, medio=medio, quien=titular)
                    self.agregar(fila_mov)
                    por_mes[mes] += valor

        valores_resumen = resumen.get("Tarjetas", {})
        for mes in sorted(set(por_mes) - set(valores_resumen)):
            if self.en_rango(mes):
                self.hallazgos.append(
                    f"**{mes:%m/%Y} · Tarjetas:** el resumen no tiene el pago de tarjetas, pero los "
                    f"resúmenes de TC Meli y TC Carli suman {pesos(por_mes[mes])}. Se migraron las "
                    "tarjetas; el saldo real del mes es menor que el de la planilla."
                )

        for mes, valor in valores_resumen.items():
            if not self.en_rango(mes):
                continue
            esperado = -valor
            diferencia = esperado - por_mes[mes]
            if abs(diferencia) > TOLERANCIA:
                self.ajustes.append((mes, "Tarjetas", esperado, por_mes[mes], diferencia))
                self.agregar(Fila(mes, "Sin clasificar", "Consumos tarjeta (histórico)",
                                  CONCEPTO_AJUSTE, diferencia))

    # -- salida -----------------------------------------------------------------

    def saldo_por_mes(self):
        saldo = defaultdict(float)
        for f in self.filas:
            saldo[f.periodo] += f.efecto_en_saldo
        return saldo


def escribir_csv(filas, ruta):
    with open(ruta, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(COLUMNAS)
        for f in sorted(filas, key=lambda f: (f.periodo, ["Ingreso", "Inversión", "Gasto"].index(f.tipo), f.grupo, f.subgrupo, f.concepto)):
            w.writerow([
                f.periodo.isoformat(), f.tipo, f.grupo, f.subgrupo, f.concepto,
                f"{round(f.monto, 2):.2f}", "", "", f.medio, f.quien,
            ])


def pesos(v):
    texto = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"$ {texto}"


def escribir_reporte(m, ruta):
    saldo = m.saldo_por_mes()
    lineas = [
        "# Reporte de migración",
        "",
        f"- Período migrado: {m.desde:%m/%Y} a {m.hasta:%m/%Y}",
        f"- Movimientos generados: {len(m.filas)}",
        f"- Ajustes de conciliación: {len(m.ajustes)}",
        "",
        "## Control: saldo mensual (planilla vs. migración)",
        "",
        "| Mes | TOTALES planilla | Saldo migrado | Diferencia |",
        "|---|---:|---:|---:|",
    ]
    for mes in sorted(saldo):
        planilla = m.totales.get(mes, 0)
        lineas.append(
            f"| {mes:%m/%Y} | {pesos(planilla)} | {pesos(saldo[mes])} | {pesos(saldo[mes] - planilla)} |"
        )

    if m.hallazgos:
        lineas += [
            "",
            "## Errores encontrados en la planilla",
            "",
            "Estos casos explican las diferencias de la tabla anterior. No se copiaron a la",
            "migración: se migró el dato correcto.",
            "",
        ] + [f"- {h}" for h in m.hallazgos]

    lineas += [
        "",
        "## Diferencias entre las hojas de detalle y el resumen",
        "",
        "En estos meses el detalle no suma lo mismo que la hoja \"Gastos\". Se respetó el",
        f"total del resumen agregando un movimiento \"{CONCEPTO_AJUSTE}\" por la diferencia.",
        "Conviene revisarlos: puede faltar algo en el detalle o haber un error en el resumen.",
        "",
        "| Mes | Concepto | Resumen | Detalle | Diferencia |",
        "|---|---|---:|---:|---:|",
    ]
    for mes, concepto, esperado, detalle, diferencia in sorted(m.ajustes):
        lineas.append(f"| {mes:%m/%Y} | {concepto} | {pesos(esperado)} | {pesos(detalle)} | {pesos(diferencia)} |")

    if m.sin_detalle:
        lineas += [
            "",
            "## Meses sin detalle",
            "",
            "La hoja de detalle no tiene datos para estos meses; se migró el total del resumen",
            "en el subgrupo General.",
            "",
        ] + [f"- {mes:%m/%Y} · {concepto}" for mes, concepto in sorted(m.sin_detalle)]

    lineas += [
        "",
        "## No migrado (cargar a mano si hace falta)",
        "",
        "- **Salidas:** la hoja de detalle tiene un formato irregular; se migró el total",
        "  mensual del resumen como Salidas / General.",
        "- **Gise:** es un control de descuentos del sueldo de la empleada; no va en la app.",
        "- **Ahorros (plazos fijos):** no se migraron para no duplicar el movimiento que ya",
        "  figura en la fila Inversiones del resumen. Los nuevos se cargan en Inversiones / Plazos fijos.",
        "- **Proyecciones:** los meses posteriores al período migrado.",
        "- **Consumos con tarjeta:** quedaron en Sin clasificar / Consumos tarjeta (histórico),",
        "  con el comercio como concepto, para clasificarlos desde la app.",
    ]
    if m.avisos:
        lineas += ["", "## Avisos", ""] + [f"- {a}" for a in dict.fromkeys(m.avisos)]

    Path(ruta).write_text("\n".join(lineas) + "\n", encoding="utf-8")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("planilla", type=Path)
    p.add_argument("--desde", default="2025-10", help="primer mes a migrar (AAAA-MM)")
    p.add_argument("--hasta", default="2026-11", help="último mes a migrar (AAAA-MM)")
    p.add_argument("--salida", type=Path, default=Path("salida"))
    args = p.parse_args()

    wb = openpyxl.load_workbook(args.planilla, data_only=True)
    m = Migracion(wb, parse_mes(args.desde), parse_mes(args.hasta))
    m.migrar()

    args.salida.mkdir(parents=True, exist_ok=True)
    escribir_csv(m.filas, args.salida / "movimientos_migrados.csv")
    escribir_reporte(m, args.salida / "reporte_migracion.md")
    print(f"{len(m.filas)} movimientos · {len(m.ajustes)} ajustes · salida en {args.salida}/")


if __name__ == "__main__":
    main()
