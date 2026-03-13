/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Trash2, 
  ArrowRightLeft,
  FileText,
  TrendingUp,
  Clock,
  DollarSign,
  ChevronDown,
  Search,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ComparisonResult {
  FACTURA_DIAN: string;
  FACTURA_HIOPOS: string;
  DOCUMENTO_HIOPOS: string;
  TIPO_DOCUMENTO: string;
  CUFE_CUDE: string;
  EMISOR_DIAN: string;
  RECEPTOR_DIAN: string;
  PROVEEDOR_HIOPOS: string;
  ALMACEN_HIOPOS: string;
  FECHA_DIAN: string;
  TOTAL_DIAN: number;
  TOTAL_HIOPOS: number;
  DIFERENCIA: number;
  DIF_VALOR: number;
  HIOPOS: 'SI' | 'NO';
  ESTADO: string;
  OBSERVACION: string;
}

interface SoloHioposResult {
  FACTURA_HIOPOS: string;
  DOCUMENTO_HIOPOS: string;
  TIPO_DOCUMENTO: string;
  PROVEEDOR_HIOPOS: string;
  ALMACEN_HIOPOS: string;
  FECHA_HIOPOS: string;
  TOTAL_HIOPOS: number;
  EXISTE_EN_DIAN: 'NO';
  ESTADO: string;
  OBSERVACION?: string;
}

interface DuplicateResult {
  FACTURA: string;
  REPETICIONES: number;
  PROVEEDOR_HIOPOS: string;
  FILAS_HIOPOS: string;
}

interface Stats {
  dianCount: number;
  hioposCount: number;
  pendingCount: number;
  pendingValue: number;
  diffCount: number;
  duplicateCount: number;
  soloHioposCount: number;
  conciliadasCount: number;
}

export default function App() {
  const [dianData, setDianData] = useState<any[] | null>(null);
  const [hioposData, setHioposData] = useState<any[] | null>(null);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [differences, setDifferences] = useState<ComparisonResult[]>([]);
  const [hioposNoDian, setHioposNoDian] = useState<SoloHioposResult[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'dianNoHiopos' | 'hioposNoDian' | 'diferencias' | 'duplicados'>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [stats, setStats] = useState<Stats>({ 
    dianCount: 0, 
    hioposCount: 0, 
    pendingCount: 0, 
    pendingValue: 0,
    diffCount: 0,
    duplicateCount: 0,
    soloHioposCount: 0,
    conciliadasCount: 0
  });
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState<'ROCOTO' | 'ARREBATAO' | 'GENERAL'>('GENERAL');
  const [auditType, setAuditType] = useState<'COMPRAS' | 'VENTAS'>('COMPRAS');
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);

  const fileDianRef = useRef<HTMLInputElement>(null);
  const fileHioposRef = useRef<HTMLInputElement>(null);

  const normHeader = (s: any) => {
    return String(s || "")
      .replace(/\u00A0/g, " ")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  };

  const cleanText = (v: any) => {
    return String(v ?? "").trim();
  };

  const normalizeKey = (v: any) => {
    return String(v ?? "")
      .toUpperCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/\//g, "")
      .replace(/[^A-Z0-9]/g, "");
  };

  const onlyDigits = (v: any) => {
    const s = String(v ?? "").replace(/\D/g, "");
    return s || "";
  };

  const parseMoney = (v: any) => {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return v;

    let s = String(v).trim();
    s = s.replace(/[^\d,.-]/g, "");
    s = s.replace(/\./g, "");
    s = s.replace(/,/g, ".");
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  };

  const pickCol = (sampleRow: any, options: string[]) => {
    const keys = Object.keys(sampleRow || {});
    const map = new Map(keys.map(k => [normHeader(k), k]));
    for (const opt of options){
      const hit = map.get(normHeader(opt));
      if (hit) return hit;
    }
    return null;
  };

  const formatExcelDate = (v: any) => {
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "number") {
      const date = XLSX.SSF.parse_date_code(v);
      if (!date) return String(v);
      const dd = String(date.d).padStart(2, "0");
      const mm = String(date.m).padStart(2, "0");
      const yy = String(date.y);
      return `${dd}-${mm}-${yy}`;
    }
    return String(v).trim();
  };

  const normalizeProveedor = (v: any) => {
    return String(v ?? "")
      .toUpperCase()
      .trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .replace(/[^A-Z0-9 ]/g, "");
  };

  const proveedorExisteEnHiopos = (proveedorDian: string, proveedoresSet: Set<string>) => {
    const p = normalizeProveedor(proveedorDian);
    if (!p) return false;
    if (proveedoresSet.has(p)) return true;

    for (const prov of proveedoresSet) {
      if (prov.includes(p) || p.includes(prov)) {
        return true;
      }
    }
    return false;
  };

  const getDianKeys = (row: any, dCols: any) => {
    const keys = new Set<string>();

    const factura = cleanText(row[dCols.factura]);
    const folio = cleanText(row[dCols.folio]);
    const prefijo = cleanText(row[dCols.prefijo]);

    // Factura completa
    if (factura) {
      keys.add(normalizeKey(factura));
      const facDigits = onlyDigits(factura);
      if (facDigits) keys.add(facDigits);
    }

    // Prefijo + folio
    if (prefijo && folio) {
      keys.add(normalizeKey(prefijo + folio));
    }

    // Solo folio
    if (folio) {
      keys.add(normalizeKey(folio));
      const folDigits = onlyDigits(folio);
      if (folDigits) keys.add(folDigits);
    }

    return Array.from(keys).filter(Boolean);
  };

  const getHioposKeys = (row: any, hCols: any) => {
    const keys = new Set<string>();

    const suDoc = cleanText(row[hCols.suDoc]);
    const serieNumero = cleanText(row[hCols.serieNumero]);

    // Su Doc (ej: IM5097543, FEAC13772, 4378)
    if (suDoc) {
      keys.add(normalizeKey(suDoc));
      const suDocDigits = onlyDigits(suDoc);
      if (suDocDigits) keys.add(suDocDigits);
    }

    // Serie / Número (ej: FC / 31282)
    if (serieNumero) {
      keys.add(normalizeKey(serieNumero));      // FC31282
      const serieDigits = onlyDigits(serieNumero);
      if (serieDigits) keys.add(serieDigits);   // 31282
    }

    return Array.from(keys).filter(Boolean);
  };

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);
  };

  const findHeaderRow = (matrix: any[][], requiredHeaders: string[], allRequired: boolean = true) => {
    const req = requiredHeaders.map(normHeader);
    for (let i = 0; i < Math.min(matrix.length, 40); i++){
      const row = (matrix[i] || []).map(normHeader);
      if (allRequired) {
        const ok = req.every(h => row.includes(h));
        if (ok) return i;
      } else {
        // Para HIOPOS, basta con que encuentre AL MENOS UNA de las opciones de factura
        const ok = req.some(h => row.includes(h));
        if (ok) return i;
      }
    }
    return 0;
  };

  const readExcelSmart = async (file: File, type: 'DIAN' | 'HIOPOS'): Promise<any[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // 1) Leemos como matriz para detectar fila real de encabezados
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

    const required = (type === "DIAN")
      ? ["Factura", "Total"]
      : ["Serie / Número", "Serie / Numero", "Serie Numero", "Serie / NÃºmero", "Su Doc", "Documento", "Factura", "No Factura", "Número", "Numero"];

    const headerRowIndex = findHeaderRow(matrix, required, type === "DIAN");
    const rawHeaders = (matrix[headerRowIndex] || []).map(h => String(h || "").trim());
    const headersNorm = rawHeaders.map(normHeader);

    // 2) Construimos objetos desde la fila siguiente al header
    const rows = [];
    for (let r = headerRowIndex + 1; r < matrix.length; r++){
      const arr = matrix[r] || [];
      // saltar filas totalmente vacías
      if (arr.every(v => String(v || "").trim() === "")) continue;

      const obj: any = {};
      for (let c = 0; c < rawHeaders.length; c++){
        const key = headersNorm[c] || `COL_${c}`;
        obj[key] = arr[c];
      }
      rows.push(obj);
    }

    return rows;
  };

  const detectHioposColumns = (sampleRow: any) => {
    return {
      suDoc: pickCol(sampleRow, ["Su Doc", "SU DOC"]),
      serieNumero: pickCol(sampleRow, [
        "Serie / Número",
        "Serie / Numero",
        "Serie / NÃºmero"
      ]),
      fechaDoc: pickCol(sampleRow, ["Fecha Doc"]),
      proveedor: pickCol(sampleRow, ["Contacto"]),
      estado: pickCol(sampleRow, ["Estado"]),
      almacen: pickCol(sampleRow, ["Almacén", "AlmacÃ©n"]),
      empleado: pickCol(sampleRow, ["Empleado"]),
      base: pickCol(sampleRow, ["Base"]),
      neto: pickCol(sampleRow, ["Neto"]),
      pendiente: pickCol(sampleRow, ["Pendiente"])
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'dian' | 'hiopos') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const data = await readExcelSmart(file, type === 'dian' ? 'DIAN' : 'HIOPOS');
      if (type === 'dian') setDianData(data);
      else setHioposData(data);
      setMessage({ text: `Archivo ${type.toUpperCase()} cargado con éxito.`, type: 'success' });
    } catch (err) {
      setMessage({ text: `Error al leer el archivo ${type.toUpperCase()}.`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!dianData || !hioposData) {
      setMessage({ text: "⚠️ Sube ambos archivos (DIAN y HIOPOS) para comparar.", type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const dian = dianData;
      const hiopos = hioposData;

      // 1) Detectar columnas
      const dCols = {
        factura: pickCol(dian[0], ["Factura"]),
        folio: pickCol(dian[0], ["Folio"]),
        prefijo: pickCol(dian[0], ["Prefijo"]),
        cufe: pickCol(dian[0], ["CUFE/CUDE", "CUFE", "CUDE"]),
        emisor: pickCol(dian[0], ["Nombre Emisor"]),
        nitEmisor: pickCol(dian[0], ["NIT Emisor"]),
        fecha: pickCol(dian[0], ["Fecha Emisión", "Fecha Emision"]),
        total: pickCol(dian[0], ["Total"])
      };

      const hCols = {
        suDoc: pickCol(hiopos[0], ["Su Doc", "SU DOC"]),
        serieNumero: pickCol(hiopos[0], ["Serie / Número", "Serie / Numero", "Serie / NÃºmero"]),
        fecha: pickCol(hiopos[0], ["Fecha Doc"]),
        proveedor: pickCol(hiopos[0], ["Contacto"]),
        nitProveedor: pickCol(hiopos[0], ["NIT", "Identificación", "Identificacion"]),
        almacen: pickCol(hiopos[0], ["Almacén", "AlmacÃ©n"]),
        neto: pickCol(hiopos[0], ["Neto"]),
        pendiente: pickCol(hiopos[0], ["Pendiente"])
      };

      if (!dCols.factura && (!dCols.prefijo || !dCols.folio)) {
        throw new Error("No encontré la columna Factura (o Prefijo/Folio) en DIAN.");
      }

      // 2) Construir un índice real de HIOPOS
      const hiIndex = new Map();   // key -> info
      const hiRows: any[] = [];    // filas normalizadas
      const proveedoresHioposSet = new Set<string>();

      hiopos.forEach(r => {
        const keys = getHioposKeys(r, hCols);
        if (!keys.length) return;

        const provRaw = r[hCols.proveedor];
        const provNorm = normalizeProveedor(provRaw);
        if (provNorm) proveedoresHioposSet.add(provNorm);

        const nitRaw = r[hCols.nitProveedor];
        const nitNorm = onlyDigits(nitRaw);
        if (nitNorm) proveedoresHioposSet.add(nitNorm);

        const info = {
          suDoc: cleanText(r[hCols.suDoc]),
          serieNumero: cleanText(r[hCols.serieNumero]),
          proveedor: cleanText(provRaw),
          fecha: formatExcelDate(r[hCols.fecha]),
          almacen: cleanText(r[hCols.almacen]),
          total_hio: parseMoney(r[hCols.neto]),
          pendiente_hio: parseMoney(r[hCols.pendiente]),
          rawRow: r
        };

        hiRows.push({ keys, info });

        keys.forEach(k => {
          if (!hiIndex.has(k)) hiIndex.set(k, info);
        });
      });

      // 3) Cruce DIAN → HIOPOS correcto
      let pendingCount = 0;
      let pendingValue = 0;
      let diffCount = 0;

      const out = dian.map(r => {
        const dKeys = getDianKeys(r, dCols);
        if (!dKeys.length) return null;

        const emisorDian = r[dCols.emisor];
        const nitDian = onlyDigits(r[dCols.nitEmisor]);
        
        // ✅ SOLO revisar proveedores que sí existen en HIOPOS
        // Esto excluye gastos administrativos, otras sedes, etc.
        const existeProv = proveedorExisteEnHiopos(emisorDian, proveedoresHioposSet) || 
                          (nitDian && proveedoresHioposSet.has(nitDian));

        if (!existeProv) {
          return null;
        }

        let hiInfo = null;
        for (const k of dKeys) {
          if (hiIndex.has(k)) {
            hiInfo = hiIndex.get(k);
            break;
          }
        }

        const existe = !!hiInfo;
        const totalDian = parseMoney(r[dCols.total]);
        const totalHiopos = hiInfo?.total_hio || 0;
        const diff = Math.abs(totalDian - totalHiopos);
        const difValor = totalDian - totalHiopos;

        if (!existe) {
          pendingCount++;
          pendingValue += totalDian;
        }

        let estado = existe ? "OK" : "PENDIENTE POR INGRESAR";
        let observacion = existe ? "" : "FACTURA NO ENCONTRADA EN HIOPOS";

        if (existe && diff > 1) {
          estado = "DIFERENCIA DE VALORES";
          observacion = `DIFERENCIA DE VALOR: ${formatCurrency(difValor)}`;
          diffCount++;
        }

        const facDian = cleanText(r[dCols.factura]) || `${cleanText(r[dCols.prefijo])}${cleanText(r[dCols.folio])}`;

        return {
          FACTURA_DIAN: facDian,
          FACTURA_HIOPOS: hiInfo?.suDoc || hiInfo?.serieNumero || "",
          DOCUMENTO_HIOPOS: hiInfo?.suDoc || hiInfo?.serieNumero || "",
          TIPO_DOCUMENTO: facDian.substring(0, 2).toUpperCase(),
          CUFE_CUDE: cleanText(r[dCols.cufe]),
          EMISOR_DIAN: cleanText(r[dCols.emisor]),
          RECEPTOR_DIAN: "",
          PROVEEDOR_HIOPOS: hiInfo?.proveedor || "",
          ALMACEN_HIOPOS: hiInfo?.almacen || "",
          FECHA_DIAN: formatExcelDate(r[dCols.fecha]),
          TOTAL_DIAN: totalDian,
          TOTAL_HIOPOS: totalHiopos,
          DIFERENCIA: diff,
          DIF_VALOR: difValor,
          HIOPOS: existe ? "SI" : "NO",
          ESTADO: estado,
          OBSERVACION: observacion
        };
      }).filter(Boolean) as ComparisonResult[];

      // 4) Cruce inverso HIOPOS → DIAN correcto
      const dianIndex = new Map();

      dian.forEach(r => {
        const keys = getDianKeys(r, dCols);
        if (!keys.length) return;

        const info = {
          factura: cleanText(r[dCols.factura]),
          folio: cleanText(r[dCols.folio]),
          prefijo: cleanText(r[dCols.prefijo]),
          cufe: cleanText(r[dCols.cufe]),
          emisor: cleanText(r[dCols.emisor]),
          fecha: formatExcelDate(r[dCols.fecha]),
          total: parseMoney(r[dCols.total])
        };

        keys.forEach(k => {
          if (!dianIndex.has(k)) dianIndex.set(k, info);
        });
      });

      const soloHioposNoDian = hiRows
        .filter(item => {
          return !item.keys.some(k => dianIndex.has(k));
        })
        .map(item => ({
          FACTURA_HIOPOS: item.info.suDoc || item.info.serieNumero,
          DOCUMENTO_HIOPOS: item.info.serieNumero,
          TIPO_DOCUMENTO: (item.info.suDoc || item.info.serieNumero).substring(0, 2).toUpperCase(),
          PROVEEDOR_HIOPOS: item.info.proveedor,
          ALMACEN_HIOPOS: item.info.almacen,
          FECHA_HIOPOS: item.info.fecha,
          TOTAL_HIOPOS: item.info.total_hio,
          EXISTE_EN_DIAN: 'NO' as const,
          ESTADO: "INGRESADO EN HIOPOS Y NO REGISTRADO EN DIAN",
          OBSERVACION: ""
        }));

      // 5) Duplicados HIOPOS
      const hiCount = new Map();
      hiRows.forEach(item => {
        const mainKey = item.keys[0];
        hiCount.set(mainKey, (hiCount.get(mainKey) || 0) + 1);
      });

      const duplicateList: DuplicateResult[] = [];
      const processedDups = new Set();
      hiRows.forEach(item => {
        const mainKey = item.keys[0];
        if (hiCount.get(mainKey) > 1 && !processedDups.has(mainKey)) {
          processedDups.add(mainKey);
          duplicateList.push({
            FACTURA: item.info.suDoc || item.info.serieNumero,
            REPETICIONES: hiCount.get(mainKey),
            PROVEEDOR_HIOPOS: item.info.proveedor,
            FILAS_HIOPOS: "Múltiples"
          });
        }
      });

      setResults(out);
      setDifferences(out.filter(r => r.ESTADO === "DIFERENCIA DE VALORES"));
      setDuplicates(duplicateList);
      setHioposNoDian(soloHioposNoDian);

      setStats({
        dianCount: dian.length,
        hioposCount: hiopos.length,
        pendingCount,
        pendingValue,
        diffCount,
        duplicateCount: duplicateList.length,
        soloHioposCount: soloHioposNoDian.length,
        conciliadasCount: out.filter(x => x.ESTADO === 'OK').length
      });

      setMessage({ text: "✅ Cruce completado correctamente.", type: 'success' });
    } catch (err: any) {
      console.error("Error al comparar archivos:", err);
      setMessage({ 
        text: `❌ Error: ${err?.message || "Revisa nombres de columnas y filas vacías."}`, 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const exportarExcel = () => {
    let data: any[] = [];
    let filename = "Reporte_Conciliacion.xlsx";
    let sheetName = "Reporte";

    if (activeTab === 'general') {
      data = filteredResults;
      filename = "Reporte_General_DIAN_vs_HIOPOS.xlsx";
      sheetName = "General";
    } else if (activeTab === 'dianNoHiopos') {
      data = filteredDianNoHiopos;
      filename = "Pendientes_DIAN_no_HIOPOS.xlsx";
      sheetName = "DIAN_no_HIOPOS";
    } else if (activeTab === 'hioposNoDian') {
      data = filteredHioposNoDian;
      filename = "HIOPOS_no_DIAN.xlsx";
      sheetName = "HIOPOS_no_DIAN";
    } else if (activeTab === 'diferencias') {
      data = filteredDifferences;
      filename = "Diferencias_Valor.xlsx";
      sheetName = "Diferencias";
    } else if (activeTab === 'duplicados') {
      data = filteredDuplicates;
      filename = "Duplicados_HIOPOS.xlsx";
      sheetName = "Duplicados";
    }

    if (data.length === 0) {
      setMessage({ text: "No hay datos para exportar en esta pestaña.", type: 'info' });
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    
    const pending = results
      .filter(r => String(r.ESTADO || "").toUpperCase().includes("PENDIENTE"))
      .map(r => ({
        FACTURA: r.FACTURA_DIAN,
        DOCUMENTO_HIOPOS: r.DOCUMENTO_HIOPOS,
        TIPO_DOCUMENTO: r.TIPO_DOCUMENTO,
        CUFE_CUDE: r.CUFE_CUDE,
        EMISOR_DIAN: r.EMISOR_DIAN,
        RECEPTOR_DIAN: r.RECEPTOR_DIAN,
        PROVEEDOR_HIOPOS: r.PROVEEDOR_HIOPOS,
        ALMACEN_HIOPOS: r.ALMACEN_HIOPOS,
        FECHA_DIAN: r.FECHA_DIAN,
        TOTAL_DIAN: r.TOTAL_DIAN,
        TOTAL_HIOPOS: r.TOTAL_HIOPOS,
        ESTADO: r.ESTADO,
        OBSERVACION: r.OBSERVACION
      }));

    if (pending.length === 0) {
      setMessage({ text: "✅ No hay pendientes para descargar.", type: 'success' });
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(pending);
    XLSX.utils.book_append_sheet(wb, ws, "PENDIENTES");
    XLSX.writeFile(wb, "Pendientes_DIAN_vs_HIOPOS.xlsx");
  };

  const handleDownloadHioposNoDian = () => {
    if (hioposNoDian.length === 0) {
      setMessage({ text: "✅ No hay registros en HIOPOS pendientes frente a DIAN.", type: 'success' });
      return;
    }

    const wb = XLSX.utils.book_new();
    const data = hioposNoDian.map(r => ({
      FACTURA_HIOPOS: r.FACTURA_HIOPOS,
      DOCUMENTO_HIOPOS: r.DOCUMENTO_HIOPOS,
      TIPO_DOCUMENTO: r.TIPO_DOCUMENTO,
      PROVEEDOR_HIOPOS: r.PROVEEDOR_HIOPOS,
      ALMACEN_HIOPOS: r.ALMACEN_HIOPOS,
      FECHA_HIOPOS: r.FECHA_HIOPOS,
      TOTAL_HIOPOS: r.TOTAL_HIOPOS,
      EXISTE_EN_DIAN: r.EXISTE_EN_DIAN,
      ESTADO: r.ESTADO
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "HIOPOS_NO_DIAN");
    XLSX.writeFile(wb, "Hiopos_no_registrado_en_DIAN.xlsx");
  };

  const handleClear = () => {
    setDianData(null);
    setHioposData(null);
    setResults([]);
    setDuplicates([]);
    setDifferences([]);
    setHioposNoDian([]);
    setSearchQuery('');
    setStatusFilter('TODOS');
    setStats({ 
      dianCount: 0, 
      hioposCount: 0, 
      pendingCount: 0, 
      pendingValue: 0,
      diffCount: 0,
      duplicateCount: 0,
      soloHioposCount: 0
    });
    setBrand('GENERAL');
    setAuditType('COMPRAS');
    setMessage(null);
    if (fileDianRef.current) fileDianRef.current.value = "";
    if (fileHioposRef.current) fileHioposRef.current.value = "";
  };

  const filteredResults = results.filter(r => {
    const matchesSearch = (r.FACTURA_DIAN || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.EMISOR_DIAN || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.PROVEEDOR_HIOPOS || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'TODOS' || r.ESTADO === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredDifferences = differences.filter(r => {
    const matchesSearch = (r.FACTURA_DIAN || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.EMISOR_DIAN || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'TODOS' || r.ESTADO === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredDuplicates = duplicates.filter(r => 
    (r.FACTURA || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
    (r.PROVEEDOR_HIOPOS || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredHioposNoDian = hioposNoDian.filter(r => 
    (r.FACTURA_HIOPOS || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
    (r.PROVEEDOR_HIOPOS || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDianNoHiopos = results.filter(r => 
    r.HIOPOS === 'NO' && (
      (r.FACTURA_DIAN || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.EMISOR_DIAN || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="min-h-screen bg-hiopos-bg text-hiopos-txt font-sans selection:bg-hiopos-primary/30">
      <div className="max-w-6xl mx-auto px-4 py-8 md:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-baseline gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-hiopos-txt">Cruce DIAN vs HIOPOS</h1>
            <span className="text-hiopos-muted text-sm">Auditoría Contable Sam Cher</span>
          </div>
          <p className="text-hiopos-muted text-sm">
            Sube los reportes de facturación para identificar discrepancias entre la DIAN y el sistema HIOPOS.
          </p>
        </header>

        {/* Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Audit Type Selector */}
          <div className="flex items-center gap-4 bg-hiopos-card border border-hiopos-line rounded-xl p-4 shadow-sm">
            <span className="text-sm font-bold text-hiopos-muted">Tipo de Auditoría:</span>
            <div className="flex gap-3">
              {(['COMPRAS', 'VENTAS'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="auditType" 
                    value={t} 
                    checked={auditType === t}
                    onChange={() => setAuditType(t)}
                    className="w-4 h-4 text-hiopos-primary border-hiopos-line focus:ring-hiopos-primary"
                  />
                  <span className={`text-sm transition-colors ${auditType === t ? 'text-hiopos-primary font-bold' : 'text-hiopos-muted group-hover:text-hiopos-txt'}`}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Brand Selector */}
          <div className="flex items-center gap-4 bg-hiopos-card border border-hiopos-line rounded-xl p-4 shadow-sm">
            <span className="text-sm font-bold text-hiopos-muted">Marca:</span>
            <div className="flex gap-3">
              {(['GENERAL', 'ROCOTO', 'ARREBATAO'] as const).map((b) => (
                <label key={b} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="brand" 
                    value={b} 
                    checked={brand === b}
                    onChange={() => setBrand(b)}
                    className="w-4 h-4 text-hiopos-primary border-hiopos-line focus:ring-hiopos-primary"
                  />
                  <span className={`text-sm transition-colors ${brand === b ? 'text-hiopos-primary font-bold' : 'text-hiopos-muted group-hover:text-hiopos-txt'}`}>
                    {b.charAt(0) + b.slice(1).toLowerCase()}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-hiopos-card border border-hiopos-line rounded-xl p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-hiopos-muted">Archivo DIAN</span>
              </div>
              {dianData && <CheckCircle2 className="w-4 h-4 text-hiopos-ok" />}
            </div>
            <label className="block text-xs text-hiopos-muted mb-2">Debe contener la columna <span className="font-mono font-bold">FACTURA</span></label>
            <div className="relative">
              <input 
                ref={fileDianRef}
                type="file" 
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'dian')}
                className="w-full bg-white border border-hiopos-line text-hiopos-muted rounded-lg p-2 text-sm cursor-pointer file:hidden"
                id="dian-upload"
              />
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-hiopos-card border border-hiopos-line rounded-xl p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-hiopos-muted">Archivo HIOPOS</span>
              </div>
              {hioposData && <CheckCircle2 className="w-4 h-4 text-hiopos-ok" />}
            </div>
            <label className="block text-xs text-hiopos-muted mb-2">Debe contener la columna <span className="font-mono font-bold">Su Doc</span></label>
            <div className="relative">
              <input 
                ref={fileHioposRef}
                type="file" 
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'hiopos')}
                className="w-full bg-white border border-hiopos-line text-hiopos-muted rounded-lg p-2 text-sm cursor-pointer file:hidden"
                id="hiopos-upload"
              />
            </div>
          </motion.div>
        </div>

        {/* Actions & Summary Cards */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button 
              onClick={handleCompare}
              disabled={loading || !dianData || !hioposData}
              className="px-5 py-2.5 bg-hiopos-primary hover:bg-hiopos-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 text-sm shadow-md active:scale-95"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Comparar Archivos
            </button>
            <button 
              onClick={handleClear}
              className="px-5 py-2.5 bg-white border border-hiopos-line hover:bg-gray-50 text-hiopos-txt font-bold rounded-xl transition-all flex items-center gap-2 text-sm shadow-sm active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
              Limpiar
            </button>
            
            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg bg-white border border-hiopos-line shadow-sm ${
                    message.type === 'error' ? 'text-hiopos-bad' : 
                    message.type === 'success' ? 'text-hiopos-ok' : 'text-hiopos-primary'
                  }`}
                >
                  {message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {message.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-hiopos-line rounded-2xl p-4 shadow-sm flex flex-col gap-1">
              <div className="text-[11px] font-bold text-hiopos-muted uppercase tracking-wider">Facturas Conciliadas</div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-hiopos-ok">{stats.conciliadasCount}</div>
                <div className="bg-green-50 text-green-700 p-1.5 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
            </div>
            <div className="bg-white border border-hiopos-line rounded-2xl p-4 shadow-sm flex flex-col gap-1">
              <div className="text-[11px] font-bold text-hiopos-muted uppercase tracking-wider">Pendientes Ingreso</div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-amber-600">{stats.pendingCount}</div>
                <div className="bg-amber-50 text-amber-700 p-1.5 rounded-lg">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
            </div>
            <div className="bg-white border border-hiopos-line rounded-2xl p-4 shadow-sm flex flex-col gap-1">
              <div className="text-[11px] font-bold text-hiopos-muted uppercase tracking-wider">HIOPOS no DIAN</div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-rose-600">{stats.soloHioposCount}</div>
                <div className="bg-rose-50 text-rose-700 p-1.5 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
            </div>
            <div className="bg-white border border-hiopos-line rounded-2xl p-4 shadow-sm flex flex-col gap-1">
              <div className="text-[11px] font-bold text-hiopos-muted uppercase tracking-wider">Diferencias</div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-purple-600">{stats.diffCount}</div>
                <div className="bg-purple-50 text-purple-700 p-1.5 rounded-lg">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
            </div>
            <div className="bg-white border border-hiopos-line rounded-2xl p-4 shadow-sm flex flex-col gap-1">
              <div className="text-[11px] font-bold text-hiopos-muted uppercase tracking-wider">Duplicadas</div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-hiopos-txt">{stats.duplicateCount}</div>
                <div className="bg-gray-50 text-gray-700 p-1.5 rounded-lg">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        {results.length > 0 && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap gap-2">
              <TabButton 
                active={activeTab === 'general'} 
                onClick={() => setActiveTab('general')}
                label="General"
                count={filteredResults.length}
              />
              <TabButton 
                active={activeTab === 'dianNoHiopos'} 
                onClick={() => setActiveTab('dianNoHiopos')}
                label="DIAN no HIOPOS"
                count={filteredDianNoHiopos.length}
                color="text-amber-600"
              />
              <TabButton 
                active={activeTab === 'hioposNoDian'} 
                onClick={() => setActiveTab('hioposNoDian')}
                label="HIOPOS no DIAN"
                count={filteredHioposNoDian.length}
                color="text-red-600"
              />
              <TabButton 
                active={activeTab === 'diferencias'} 
                onClick={() => setActiveTab('diferencias')}
                label="Diferencias"
                count={filteredDifferences.length}
                color="text-purple-600"
              />
              <TabButton 
                active={activeTab === 'duplicados'} 
                onClick={() => setActiveTab('duplicados')}
                label="Duplicados"
                count={filteredDuplicates.length}
                color="text-orange-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px]">
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-white border border-hiopos-line rounded-xl py-2.5 pl-4 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-hiopos-primary/20 focus:border-hiopos-primary transition-all shadow-sm appearance-none cursor-pointer"
                >
                  <option value="TODOS">Todos los estados</option>
                  <option value="OK">OK</option>
                  <option value="PENDIENTE POR INGRESAR">Pendiente por ingresar</option>
                  <option value="INGRESADO EN HIOPOS Y NO REGISTRADO EN DIAN">HIOPOS no DIAN</option>
                  <option value="DIFERENCIA DE VALORES">Diferencia de valores</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-hiopos-muted" />
                </div>
              </div>

              <div className="relative flex-1 min-w-[280px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-hiopos-muted" />
                <input 
                  type="text"
                  placeholder="Buscar factura, documento, emisor o proveedor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-hiopos-line rounded-xl py-2.5 pl-11 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-hiopos-primary/20 focus:border-hiopos-primary transition-all shadow-sm"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <X className="w-3 h-3 text-hiopos-muted" />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={exportarExcel}
                  disabled={results.length === 0 && hioposNoDian.length === 0}
                  className="px-4 py-2.5 bg-hiopos-primary hover:bg-hiopos-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 text-sm shadow-sm active:scale-95"
                  title="Exportar Excel"
                >
                  <Download className="w-4 h-4" />
                  Exportar Excel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white border border-hiopos-line rounded-xl overflow-hidden shadow-sm"
          >
            <div className="overflow-x-auto">
              {activeTab === 'general' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#dbeafe] border-b border-hiopos-line">
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">FACTURA (DIAN)</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">CUFE/CUDE</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">DOCUMENTO (HIO)</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">EMISOR (DIAN)</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">PROVEEDOR (HIOPOS)</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">FECHA</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">TOTAL (DIAN)</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">TOTAL (HIOPOS)</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-center">HIOPOS</th>
                      <th className="px-4 py-4 text-[13px] font-bold text-[#0f172a] text-left">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f7]">
                    {filteredResults.map((r, i) => (
                      <tr key={i} className="hover:bg-[#f8fbff] transition-colors group">
                        <td className="px-4 py-4">
                          <strong className="text-sm text-hiopos-txt">{r.FACTURA_DIAN || '---'}</strong>
                        </td>
                        <td className="px-4 py-4 text-[11px] text-hiopos-muted font-mono truncate max-w-[120px]" title={r.CUFE_CUDE}>
                          {r.CUFE_CUDE || '---'}
                        </td>
                        <td className="px-4 py-4 text-sm text-hiopos-muted font-mono">
                          {r.DOCUMENTO_HIOPOS || '---'}
                        </td>
                        <td className="px-4 py-4 text-sm text-hiopos-muted truncate max-w-[180px]" title={r.EMISOR_DIAN}>
                          {r.EMISOR_DIAN || '---'}
                        </td>
                        <td className="px-4 py-4 text-sm text-hiopos-muted truncate max-w-[180px]" title={r.PROVEEDOR_HIOPOS}>
                          {r.PROVEEDOR_HIOPOS || '---'}
                        </td>
                        <td className="px-4 py-4 text-sm text-hiopos-muted">
                          {r.FECHA_DIAN || '---'}
                        </td>
                        <td className="px-4 py-4 text-sm font-bold whitespace-nowrap">
                          {formatCurrency(r.TOTAL_DIAN)}
                        </td>
                        <td className="px-4 py-4 text-sm font-bold whitespace-nowrap">
                          {formatCurrency(r.TOTAL_HIOPOS)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                            r.HIOPOS === 'SI' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#b91c1c]'
                          }`}>
                            {r.HIOPOS || '---'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-sm font-bold ${
                            r.ESTADO === 'OK' ? 'text-[#16a34a]' : 'text-[#dc2626]'
                          }`}>
                            {r.ESTADO || '---'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredResults.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-20 text-center text-hiopos-muted text-sm italic">
                          No se encontraron resultados para tu búsqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'diferencias' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-hiopos-header border-b border-hiopos-line">
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Factura (HIO)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Documento (HIO)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Proveedor</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Total DIAN</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Total HIOPOS</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Diferencia (Valor)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hiopos-line">
                    {filteredDifferences.map((r, i) => (
                      <tr key={i} className="hover:bg-hiopos-header-hover transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{r.FACTURA_HIOPOS || '---'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-hiopos-muted">{r.DOCUMENTO_HIOPOS || '---'}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted truncate max-w-[150px]" title={r.EMISOR_DIAN}>{r.EMISOR_DIAN || '---'}</td>
                        <td className="px-4 py-3 text-xs font-bold">{formatCurrency(r.TOTAL_DIAN)}</td>
                        <td className="px-4 py-3 text-xs font-bold">{formatCurrency(r.TOTAL_HIOPOS)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-hiopos-bad">{formatCurrency(r.DIF_VALOR)}</td>
                      </tr>
                    ))}
                    {filteredDifferences.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-hiopos-muted text-sm">No se encontraron diferencias de valor.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'duplicados' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-hiopos-header border-b border-hiopos-line">
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Factura (Su Doc)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Repeticiones</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Proveedor (HIOPOS)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Filas en HIOPOS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hiopos-line">
                    {filteredDuplicates.map((r, i) => (
                      <tr key={i} className="hover:bg-hiopos-header-hover transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{r.FACTURA || '---'}</td>
                        <td className="px-4 py-3 text-xs font-bold text-hiopos-bad">{r.REPETICIONES}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted">{r.PROVEEDOR_HIOPOS || '---'}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted">{r.FILAS_HIOPOS || '---'}</td>
                      </tr>
                    ))}
                    {filteredDuplicates.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-hiopos-muted text-sm">No se encontraron facturas duplicadas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'dianNoHiopos' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-hiopos-header border-b border-hiopos-line">
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Factura (DIAN)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Emisor (DIAN)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Total (DIAN)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hiopos-line">
                    {filteredDianNoHiopos.map((r, i) => (
                      <tr key={i} className="hover:bg-hiopos-header-hover transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{r.FACTURA_DIAN || '---'}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted truncate max-w-[200px]" title={r.EMISOR_DIAN}>{r.EMISOR_DIAN || '---'}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted">{r.FECHA_DIAN || '---'}</td>
                        <td className="px-4 py-3 text-xs font-bold">{formatCurrency(r.TOTAL_DIAN)}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-hiopos-bad">
                            {r.ESTADO || '---'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredDianNoHiopos.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-hiopos-muted text-sm">No se encontraron facturas pendientes por ingresar en HIOPOS.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'hioposNoDian' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-hiopos-header border-b border-hiopos-line">
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Factura (HIOPOS)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Documento (HIO)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Tipo</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Proveedor (HIOPOS)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Almacén</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Fecha (HIOPOS)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Total (HIOPOS)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Estado</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hiopos-line">
                    {filteredHioposNoDian.map((r, i) => (
                      <tr key={i} className="hover:bg-hiopos-header-hover transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{r.FACTURA_HIOPOS}</td>
                        <td className="px-4 py-3 font-mono text-[10px] text-hiopos-muted">{r.DOCUMENTO_HIOPOS}</td>
                        <td className="px-4 py-3 text-[10px] font-bold text-hiopos-primary">{r.TIPO_DOCUMENTO}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted truncate max-w-[150px]" title={r.PROVEEDOR_HIOPOS}>{r.PROVEEDOR_HIOPOS}</td>
                        <td className="px-4 py-3 text-[10px] text-hiopos-muted">{r.ALMACEN_HIOPOS}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted">{r.FECHA_HIOPOS}</td>
                        <td className="px-4 py-3 text-xs font-bold">{formatCurrency(r.TOTAL_HIOPOS)}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-hiopos-bad">
                            {r.ESTADO}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-hiopos-muted italic">
                          {r.OBSERVACION}
                        </td>
                      </tr>
                    ))}
                    {filteredHioposNoDian.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-hiopos-muted text-sm">No se encontraron facturas solo en HIOPOS.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <footer className="mt-10 pt-6 border-t border-hiopos-line text-center">
          <p className="text-xs text-hiopos-muted leading-relaxed max-w-2xl mx-auto">
            Tip: Si tus archivos Excel tienen varias hojas, la aplicación tomará la <span className="text-hiopos-txt font-bold">primera hoja</span>. 
            El cruce se realiza comparando el número de factura (<span className="text-hiopos-txt font-bold italic">FACTURA</span> en DIAN vs <span className="text-hiopos-txt font-bold italic">Su Doc</span> en HIOPOS).
          </p>
        </footer>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, highlight = false }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border transition-all bg-hiopos-card border-hiopos-line shadow-sm`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 bg-hiopos-bg rounded-md border border-hiopos-line">
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-hiopos-muted">{label}</span>
      </div>
      <div className={`text-base font-bold truncate ${highlight ? 'text-hiopos-bad' : 'text-hiopos-txt'}`}>
        {value}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, count, color = "text-hiopos-primary" }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap border shadow-sm active:scale-95 ${
        active 
          ? `bg-hiopos-primary border-hiopos-primary text-white` 
          : `bg-white border-hiopos-line text-hiopos-muted hover:bg-gray-50`
      }`}
    >
      {label}
      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-gray-100 ' + color}`}>
        {count}
      </span>
    </button>
  );
}
