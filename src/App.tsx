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
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ComparisonResult {
  FACTURA: string;
  FECHA_DIAN: string;
  TOTAL_DIAN: number;
  EXISTE_EN_HIOPOS: 'SI' | 'NO';
  ESTADO: string;
}

interface Stats {
  dianCount: number;
  hioposCount: number;
  pendingCount: number;
  pendingValue: number;
}

export default function App() {
  const [dianData, setDianData] = useState<any[] | null>(null);
  const [hioposData, setHioposData] = useState<any[] | null>(null);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [stats, setStats] = useState<Stats>({ dianCount: 0, hioposCount: 0, pendingCount: 0, pendingValue: 0 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);

  const fileDianRef = useRef<HTMLInputElement>(null);
  const fileHioposRef = useRef<HTMLInputElement>(null);

  const normalizeFactura = (v: any) => {
    if (v === null || v === undefined) return "";
    return String(v).trim().toUpperCase();
  };

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n);
  };

  const findCol = (obj: any, options: string[]) => {
    const keys = Object.keys(obj || {});
    const map = keys.reduce((acc: any, k) => {
      acc[k.toLowerCase()] = k;
      return acc;
    }, {});
    for (const opt of options) {
      const hit = map[opt.toLowerCase()];
      if (hit) return hit;
    }
    return null;
  };

  const readExcel = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'dian' | 'hiopos') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const data = await readExcel(file);
      if (type === 'dian') setDianData(data);
      else setHioposData(data);
      setMessage({ text: `Archivo ${type.toUpperCase()} cargado con éxito.`, type: 'success' });
    } catch (err) {
      setMessage({ text: `Error al leer el archivo ${type.toUpperCase()}.`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = () => {
    if (!dianData || !hioposData) {
      setMessage({ text: "⚠️ Sube ambos archivos (DIAN y HIOPOS) para comparar.", type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const dianFacturaCol = findCol(dianData[0], ["FACTURA", "Factura", "No Factura", "Número Factura", "Prefijo y Número"]);
      const dianTotalCol = findCol(dianData[0], ["Total", "TOTAL", "Neto", "NETO", "Valor Total"]);
      const dianFechaCol = findCol(dianData[0], ["Fecha Emisión", "Fecha Emision", "Fecha", "FECHA", "Fecha de Emisión"]);

      const hioposFacturaCol = findCol(hioposData[0], ["Su Doc", "SU DOC", "Factura", "FACTURA", "Documento", "Referencia"]);

      if (!dianFacturaCol) {
        setMessage({ text: "❌ No se encontró la columna de FACTURA en el archivo DIAN.", type: 'error' });
        return;
      }
      if (!hioposFacturaCol) {
        setMessage({ text: "❌ No se encontró la columna de Su Doc (o equivalente) en el archivo HIOPOS.", type: 'error' });
        return;
      }

      const setH = new Set(hioposData.map(r => normalizeFactura(r[hioposFacturaCol])).filter(Boolean));

      let pendingCount = 0;
      let pendingValue = 0;

      const out: ComparisonResult[] = dianData.map(r => {
        const fac = normalizeFactura(r[dianFacturaCol]);
        const existe = setH.has(fac);
        const estado = existe ? "OK" : "PENDIENTE POR INGRESAR";
        
        let total = 0;
        if (dianTotalCol) {
          const val = r[dianTotalCol];
          if (typeof val === 'number') {
            total = val;
          } else {
            total = Number(String(val).replace(/\./g, "").replace(",", "."));
          }
        }

        const fecha = dianFechaCol ? String(r[dianFechaCol]) : "";
        if (!existe) {
          pendingCount++;
          pendingValue += (isNaN(total) ? 0 : total);
        }
        return { 
          FACTURA: fac, 
          FECHA_DIAN: fecha, 
          TOTAL_DIAN: total, 
          EXISTE_EN_HIOPOS: existe ? "SI" : "NO", 
          ESTADO: estado 
        };
      });

      setResults(out);
      setStats({
        dianCount: out.length,
        hioposCount: setH.size,
        pendingCount,
        pendingValue
      });
      setMessage({ text: "✅ Cruce completado con éxito.", type: 'success' });
    } catch (err) {
      console.error(err);
      setMessage({ text: "❌ Error procesando el cruce. Revisa el formato de los archivos.", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CRUCE");
    XLSX.writeFile(wb, "Cruce_DIAN_vs_HIOPOS.xlsx");
  };

  const handleClear = () => {
    setDianData(null);
    setHioposData(null);
    setResults([]);
    setStats({ dianCount: 0, hioposCount: 0, pendingCount: 0, pendingValue: 0 });
    setMessage(null);
    if (fileDianRef.current) fileDianRef.current.value = "";
    if (fileHioposRef.current) fileHioposRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-[#0b1220] text-[#eaf0ff] font-sans selection:bg-blue-500/30">
      <div className="max-w-7xl mx-auto px-4 py-8 md:px-8">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <ArrowRightLeft className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Cruce DIAN vs HIOPOS</h1>
          </div>
          <p className="text-[#9fb1d1] text-lg">
            Sube los reportes de facturación para identificar discrepancias entre la DIAN y el sistema HIOPOS.
          </p>
        </header>

        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#111a2e] border border-[#22304f] rounded-2xl p-6 shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-sm font-semibold uppercase tracking-wider text-[#9fb1d1]">Archivo DIAN</span>
              </div>
              {dianData && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
            </div>
            <p className="text-sm text-[#9fb1d1] mb-4">Debe contener la columna <span className="text-white font-mono">FACTURA</span>.</p>
            <div className="relative group">
              <input 
                ref={fileDianRef}
                type="file" 
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'dian')}
                className="hidden"
                id="dian-upload"
              />
              <label 
                htmlFor="dian-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#22304f] rounded-xl cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
              >
                <Upload className="w-8 h-8 mb-2 text-[#9fb1d1] group-hover:text-blue-400" />
                <span className="text-sm text-[#9fb1d1] group-hover:text-blue-400 font-medium">
                  {dianData ? "Cambiar archivo" : "Seleccionar DIAN.xlsx"}
                </span>
              </label>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#111a2e] border border-[#22304f] rounded-2xl p-6 shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-semibold uppercase tracking-wider text-[#9fb1d1]">Archivo HIOPOS</span>
              </div>
              {hioposData && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
            </div>
            <p className="text-sm text-[#9fb1d1] mb-4">Debe contener la columna <span className="text-white font-mono">Su Doc</span>.</p>
            <div className="relative group">
              <input 
                ref={fileHioposRef}
                type="file" 
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e, 'hiopos')}
                className="hidden"
                id="hiopos-upload"
              />
              <label 
                htmlFor="hiopos-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#22304f] rounded-xl cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group"
              >
                <Upload className="w-8 h-8 mb-2 text-[#9fb1d1] group-hover:text-emerald-400" />
                <span className="text-sm text-[#9fb1d1] group-hover:text-emerald-400 font-medium">
                  {hioposData ? "Cambiar archivo" : "Seleccionar HIOPOS.xlsx"}
                </span>
              </label>
            </div>
          </motion.div>
        </div>

        {/* Actions & Stats */}
        <div className="bg-[#111a2e] border border-[#22304f] rounded-2xl p-6 shadow-xl mb-8">
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <button 
              onClick={handleCompare}
              disabled={loading || !dianData || !hioposData}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              <ArrowRightLeft className="w-5 h-5" />
              Comparar Archivos
            </button>
            <button 
              onClick={handleDownload}
              disabled={results.length === 0}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Descargar Excel
            </button>
            <button 
              onClick={handleClear}
              className="px-6 py-3 bg-[#1d2c4f] hover:bg-[#2a3a63] text-[#eaf0ff] font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Limpiar
            </button>
            
            <AnimatePresence>
              {message && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center gap-2 text-sm font-medium ${
                    message.type === 'error' ? 'text-rose-400' : 
                    message.type === 'success' ? 'text-emerald-400' : 'text-blue-400'
                  }`}
                >
                  {message.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {message.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              label="Facturas DIAN" 
              value={stats.dianCount.toLocaleString()} 
              icon={<FileText className="w-5 h-5 text-blue-400" />}
            />
            <StatCard 
              label="Facturas HIOPOS" 
              value={stats.hioposCount.toLocaleString()} 
              icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
            />
            <StatCard 
              label="Pendientes" 
              value={stats.pendingCount.toLocaleString()} 
              icon={<Clock className="w-5 h-5 text-amber-400" />}
              highlight={stats.pendingCount > 0}
            />
            <StatCard 
              label="Valor Pendiente" 
              value={formatCurrency(stats.pendingValue)} 
              icon={<DollarSign className="w-5 h-5 text-rose-400" />}
              highlight={stats.pendingValue > 0}
            />
          </div>
        </div>

        {/* Results Table */}
        {results.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-[#111a2e] border border-[#22304f] rounded-2xl overflow-hidden shadow-xl"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0d162a] border-bottom border-[#22304f]">
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#9fb1d1]">Factura</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#9fb1d1]">Fecha Emisión</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#9fb1d1]">Total (DIAN)</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#9fb1d1]">En HIOPOS</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#9fb1d1]">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#22304f]">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-blue-500/5 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm">{r.FACTURA}</td>
                      <td className="px-6 py-4 text-sm text-[#9fb1d1]">{r.FECHA_DIAN}</td>
                      <td className="px-6 py-4 text-sm font-medium">{formatCurrency(r.TOTAL_DIAN)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          r.EXISTE_EN_HIOPOS === 'SI' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {r.EXISTE_EN_HIOPOS}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-semibold ${
                          r.ESTADO === 'OK' ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {r.ESTADO}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-[#22304f] text-center">
          <p className="text-sm text-[#9fb1d1] leading-relaxed max-w-2xl mx-auto">
            Tip: Si tus archivos Excel tienen varias hojas, la aplicación tomará la <span className="text-white font-medium">primera hoja</span>. 
            El cruce se realiza comparando el número de factura (<span className="text-white font-medium italic">FACTURA</span> en DIAN vs <span className="text-white font-medium italic">Su Doc</span> en HIOPOS).
          </p>
        </footer>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, highlight = false }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border transition-all ${
      highlight ? 'bg-rose-500/5 border-rose-500/20' : 'bg-[#0d162a] border-[#22304f]'
    }`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-[#111a2e] rounded-lg border border-[#22304f]">
          {icon}
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-[#9fb1d1]">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${highlight ? 'text-rose-400' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}
