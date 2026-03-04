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
  Search,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ComparisonResult {
  FACTURA: string;
  EMISOR_DIAN: string;
  RECEPTOR_DIAN: string;
  PROVEEDOR_HIOPOS: string;
  FECHA_DIAN: string;
  TOTAL_DIAN: number;
  TOTAL_HIOPOS: number;
  DIFERENCIA: number;
  EXISTE_EN_HIOPOS: 'SI' | 'NO';
  ESTADO: string;
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
}

export default function App() {
  const [dianData, setDianData] = useState<any[] | null>(null);
  const [hioposData, setHioposData] = useState<any[] | null>(null);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [differences, setDifferences] = useState<ComparisonResult[]>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'diferencias' | 'duplicados'>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<Stats>({ 
    dianCount: 0, 
    hioposCount: 0, 
    pendingCount: 0, 
    pendingValue: 0,
    diffCount: 0,
    duplicateCount: 0
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);

  const fileDianRef = useRef<HTMLInputElement>(null);
  const fileHioposRef = useRef<HTMLInputElement>(null);

  const normHeader = (s: any) => {
    return String(s || "")
      .replace(/\u00A0/g, " ") // NBSP
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // sin tildes
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  };

  const normalizeFactura = (v: any) => {
    if (v === null || v === undefined) return "";
    let s = (typeof v === "number") ? String(Math.trunc(v)) : String(v);
    s = s.trim().toUpperCase();
    // deja solo A-Z 0-9
    s = s.replace(/[^A-Z0-9]/g, "");
    return s;
  };

  const parseMoney = (v: any) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;

    let s = String(v).trim();
    if (!s) return 0;

    s = s.replace(/[^\d,.-]/g, "");  // quita $ y letras
    // Caso Colombia: miles con punto, decimales con coma (a veces)
    // quitamos puntos de miles
    s = s.replace(/\./g, "");
    // convertimos coma decimal a punto
    s = s.replace(/,/g, ".");

    const n = Number(s);
    return isNaN(n) ? 0 : n;
  };

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);
  };

  const findHeaderRow = (matrix: any[][], requiredHeaders: string[]) => {
    const req = requiredHeaders.map(normHeader);
    for (let i = 0; i < Math.min(matrix.length, 40); i++){
      const row = (matrix[i] || []).map(normHeader);
      const ok = req.every(h => row.includes(h));
      if (ok) return i;
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
      : ["Su Doc", "Neto"];

    const headerRowIndex = findHeaderRow(matrix, required);
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

  const pickCol = (sampleRow: any, options: string[]) => {
    const keys = Object.keys(sampleRow || {}); // ya normalizados
    const set = new Set(keys);
    for (const opt of options){
      const k = normHeader(opt);
      if (set.has(k)) return k;
    }
    return null;
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

      // ====== COLUMNAS (FORMATO REAL) ======
      const cD_FACT = pickCol(dian[0], ["Factura", "FACTURA"]);
      const cD_EMISOR = pickCol(dian[0], ["Nombre Emisor", "Emisor"]);
      const cD_RECEPTOR = pickCol(dian[0], ["Nombre Receptor", "Receptor", "Nombre receptor"]);
      const cD_FEC  = pickCol(dian[0], ["Fecha Emisión", "Fecha Emision", "Fecha"]);
      const cD_TOT  = pickCol(dian[0], ["Total", "TOTAL"]);

      const cH_FACT = pickCol(hiopos[0], ["Su Doc", "SUDOC", "SU DOC"]);
      const cH_PROV = pickCol(hiopos[0], ["Contacto", "PROVEEDOR"]);
      const cH_NETO = pickCol(hiopos[0], ["Neto"]);
      const cH_PEND = pickCol(hiopos[0], ["Pendiente"]);

      if(!cD_FACT){ 
        setMessage({ text: "❌ No encuentro columna 'Factura' en DIAN.", type: 'error' });
        setLoading(false);
        return; 
      }
      if(!cH_FACT){ 
        setMessage({ text: "❌ No encuentro columna 'Su Doc' en HIOPOS.", type: 'error' });
        setLoading(false);
        return; 
      }

      // ====== MAPA HIOPOS (factura -> datos) ======
      const hiMap = new Map<string, { proveedor: string; neto: number; pendiente: number; rows: number[] }>();
      const hiCount = new Map<string, number>();

      hiopos.forEach((r, idx) => {
        const fac = normalizeFactura(r[cH_FACT]);
        if(!fac) return;

        hiCount.set(fac, (hiCount.get(fac) || 0) + 1);

        if(!hiMap.has(fac)){
          hiMap.set(fac, {
            proveedor: cH_PROV ? String(r[cH_PROV] || "").trim() : "",
            neto: cH_NETO ? parseMoney(r[cH_NETO]) : 0,
            pendiente: cH_PEND ? parseMoney(r[cH_PEND]) : 0,
            rows: [idx + 2]
          });
        } else {
          hiMap.get(fac)!.rows.push(idx + 2);
        }
      });

      const hiSet = new Set([...hiMap.keys()]);

      // ====== DUPLICADOS ======
      const duplicateList: DuplicateResult[] = [];
      hiCount.forEach((count, fac) => {
        if(count > 1){
          const base = hiMap.get(fac) || { proveedor: "", rows: [] };
          duplicateList.push({
            FACTURA: fac,
            REPETICIONES: count,
            PROVEEDOR_HIOPOS: base.proveedor || "",
            FILAS_HIOPOS: base.rows.join(", ")
          });
        }
      });
      setDuplicates(duplicateList);

      // ====== CRUCE DIAN vs HIOPOS ======
      let pendingCount = 0;
      let pendingValue = 0;
      let diffCount = 0;

      const out: ComparisonResult[] = dian.map(r => {
        const fac = normalizeFactura(r[cD_FACT]);
        if(!fac) return null;

        const emisorD = cD_EMISOR ? String(r[cD_EMISOR] || "").trim() : "";
        const receptorD = cD_RECEPTOR ? String(r[cD_RECEPTOR] || "").trim() : "";
        const fecha = cD_FEC ? String(r[cD_FEC]) : "";
        const totalDian = cD_TOT ? parseMoney(r[cD_TOT]) : 0;

        const existe = hiSet.has(fac);
        const hiInfo = existe ? (hiMap.get(fac) || { proveedor: "", neto: 0 }) : { proveedor: "", neto: 0 };
        
        const provHi = hiInfo.proveedor || "";
        const totalHiopos = hiInfo.neto || 0;
        const diferencia = existe ? Math.abs(totalDian - totalHiopos) : 0;
        const estado = existe ? "OK" : "PENDIENTE POR INGRESAR";

        if(!existe){
          pendingCount++;
          pendingValue += totalDian;
        }

        if (existe && diferencia > 1) {
          diffCount++;
        }

        return {
          FACTURA: fac,
          EMISOR_DIAN: emisorD,
          RECEPTOR_DIAN: receptorD,
          PROVEEDOR_HIOPOS: provHi,
          FECHA_DIAN: fecha,
          TOTAL_DIAN: totalDian,
          TOTAL_HIOPOS: totalHiopos,
          DIFERENCIA: diferencia,
          EXISTE_EN_HIOPOS: existe ? "SI" : "NO",
          ESTADO: estado
        };
      }).filter(Boolean) as ComparisonResult[];

      setResults(out);
      setDifferences(out.filter(r => r.EXISTE_EN_HIOPOS === 'SI' && r.DIFERENCIA > 1));
      setStats({
        dianCount: out.length,
        hioposCount: hiSet.size,
        pendingCount,
        pendingValue,
        diffCount,
        duplicateCount: duplicateList.length
      });
      setMessage({ text: "✅ Cruce completado correctamente.", type: 'success' });
    } catch (err) {
      console.error(err);
      setMessage({ text: "❌ Error procesando el cruce. Revisa el formato de los archivos.", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    
    const pending = results.filter(r => 
      String(r.ESTADO || "").toUpperCase().includes("PENDIENTE")
    );

    if (pending.length === 0) {
      setMessage({ text: "✅ No hay pendientes para descargar.", type: 'success' });
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(pending);
    XLSX.utils.book_append_sheet(wb, ws, "PENDIENTES");
    XLSX.writeFile(wb, "Pendientes_DIAN_vs_HIOPOS.xlsx");
  };

  const handleClear = () => {
    setDianData(null);
    setHioposData(null);
    setResults([]);
    setDuplicates([]);
    setDifferences([]);
    setSearchQuery('');
    setStats({ 
      dianCount: 0, 
      hioposCount: 0, 
      pendingCount: 0, 
      pendingValue: 0,
      diffCount: 0,
      duplicateCount: 0
    });
    setMessage(null);
    if (fileDianRef.current) fileDianRef.current.value = "";
    if (fileHioposRef.current) fileHioposRef.current.value = "";
  };

  const filteredResults = results.filter(r => 
    r.FACTURA.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.EMISOR_DIAN.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.RECEPTOR_DIAN.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.PROVEEDOR_HIOPOS.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDifferences = differences.filter(r => 
    r.FACTURA.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.EMISOR_DIAN.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.RECEPTOR_DIAN.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDuplicates = duplicates.filter(r => 
    r.FACTURA.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.PROVEEDOR_HIOPOS.toLowerCase().includes(searchQuery.toLowerCase())
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

        {/* Actions & Stats */}
        <div className="bg-hiopos-card border border-hiopos-line rounded-xl p-5 shadow-sm mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button 
              onClick={handleCompare}
              disabled={loading || !dianData || !hioposData}
              className="px-5 py-2.5 bg-hiopos-primary hover:bg-hiopos-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Comparar Archivos
            </button>
            <button 
              onClick={handleDownload}
              disabled={results.length === 0}
              className="px-5 py-2.5 bg-hiopos-card border border-hiopos-line hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-hiopos-txt font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
            >
              <Download className="w-4 h-4" />
              Descargar Excel
            </button>
            <button 
              onClick={handleClear}
              className="px-5 py-2.5 bg-hiopos-card border border-hiopos-line hover:bg-gray-50 text-hiopos-txt font-semibold rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
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
                  className={`flex items-center gap-2 text-xs font-bold ${
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard 
              label="Facturas DIAN" 
              value={stats.dianCount.toLocaleString()} 
              icon={<FileText className="w-4 h-4 text-hiopos-primary" />}
            />
            <StatCard 
              label="Facturas HIOPOS" 
              value={stats.hioposCount.toLocaleString()} 
              icon={<TrendingUp className="w-4 h-4 text-hiopos-ok" />}
            />
            <StatCard 
              label="Pendientes" 
              value={stats.pendingCount.toLocaleString()} 
              icon={<Clock className="w-4 h-4 text-amber-500" />}
              highlight={stats.pendingCount > 0}
            />
            <StatCard 
              label="Valor Pendiente" 
              value={formatCurrency(stats.pendingValue)} 
              icon={<DollarSign className="w-4 h-4 text-hiopos-bad" />}
              highlight={stats.pendingValue > 0}
            />
            <StatCard 
              label="Diferencias" 
              value={stats.diffCount.toLocaleString()} 
              icon={<ArrowRightLeft className="w-4 h-4 text-purple-500" />}
              highlight={stats.diffCount > 0}
            />
            <StatCard 
              label="Duplicados" 
              value={stats.duplicateCount.toLocaleString()} 
              icon={<FileSpreadsheet className="w-4 h-4 text-orange-500" />}
              highlight={stats.duplicateCount > 0}
            />
          </div>
        </div>

        {/* Tabs & Search */}
        {results.length > 0 && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
              <TabButton 
                active={activeTab === 'general'} 
                onClick={() => setActiveTab('general')}
                label="General"
                count={filteredResults.length}
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

            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hiopos-muted" />
              <input 
                type="text"
                placeholder="Buscar factura o proveedor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-hiopos-line rounded-lg py-2 pl-9 pr-8 text-sm focus:outline-none focus:border-hiopos-primary transition-all shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <X className="w-3 h-3 text-hiopos-muted" />
                </button>
              )}
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
                    <tr className="bg-hiopos-header border-b border-hiopos-line">
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Factura</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Emisor (DIAN)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Receptor (DIAN)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Proveedor (HIOPOS)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Total (DIAN)</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider text-center">HIOPOS</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hiopos-line">
                    {filteredResults.map((r, i) => (
                      <tr key={i} className="hover:bg-hiopos-header-hover transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{r.FACTURA}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted truncate max-w-[120px]" title={r.EMISOR_DIAN}>{r.EMISOR_DIAN}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted truncate max-w-[120px]" title={r.RECEPTOR_DIAN}>{r.RECEPTOR_DIAN}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted truncate max-w-[120px]" title={r.PROVEEDOR_HIOPOS}>{r.PROVEEDOR_HIOPOS}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted">{r.FECHA_DIAN}</td>
                        <td className="px-4 py-3 text-xs font-bold">{formatCurrency(r.TOTAL_DIAN)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            r.EXISTE_EN_HIOPOS === 'SI' ? 'bg-emerald-50 border-emerald-200 text-hiopos-ok' : 'bg-rose-50 border-rose-200 text-hiopos-bad'
                          }`}>
                            {r.EXISTE_EN_HIOPOS}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold ${
                            r.ESTADO === 'OK' ? 'text-hiopos-ok' : 'text-hiopos-bad'
                          }`}>
                            {r.ESTADO}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredResults.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-hiopos-muted text-sm">No se encontraron resultados para tu búsqueda.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'diferencias' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-hiopos-header border-b border-hiopos-line">
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Factura</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Proveedor</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Total DIAN</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Total HIOPOS</th>
                      <th className="px-4 py-3 text-xs font-bold text-hiopos-txt uppercase tracking-wider">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hiopos-line">
                    {filteredDifferences.map((r, i) => (
                      <tr key={i} className="hover:bg-hiopos-header-hover transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{r.FACTURA}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted truncate max-w-[150px]" title={r.EMISOR_DIAN}>{r.EMISOR_DIAN}</td>
                        <td className="px-4 py-3 text-xs font-bold">{formatCurrency(r.TOTAL_DIAN)}</td>
                        <td className="px-4 py-3 text-xs font-bold">{formatCurrency(r.TOTAL_HIOPOS)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-hiopos-bad">{formatCurrency(r.DIFERENCIA)}</td>
                      </tr>
                    ))}
                    {filteredDifferences.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-hiopos-muted text-sm">No se encontraron diferencias de valor.</td>
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
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{r.FACTURA}</td>
                        <td className="px-4 py-3 text-xs font-bold text-hiopos-bad">{r.REPETICIONES}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted">{r.PROVEEDOR_HIOPOS}</td>
                        <td className="px-4 py-3 text-xs text-hiopos-muted">{r.FILAS_HIOPOS}</td>
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
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap border shadow-sm ${
        active 
          ? `bg-hiopos-header border-hiopos-primary text-hiopos-primary-dark` 
          : `bg-white border-hiopos-line text-hiopos-muted hover:bg-gray-50`
      }`}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded-md bg-hiopos-bg text-[9px] border border-hiopos-line ${active ? 'text-hiopos-primary-dark' : color}`}>
        {count}
      </span>
    </button>
  );
}
