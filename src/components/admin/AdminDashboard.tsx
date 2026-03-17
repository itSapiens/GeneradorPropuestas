import React, { useState, useEffect } from "react";
import { LayoutDashboard, Users, Zap, Settings, LogOut, Search, Filter, MoreVertical, Trash2, Edit, TrendingUp, MapPin, Calendar, FileText, Sparkles, Loader2, ExternalLink } from "lucide-react";
import Button from "../ui/Button";
import { formatCurrency, formatNumber, cn } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { type Client, type Installation, type Document } from "../../lib/validators";
import InstallationForm from "./InstallationForm";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("studies");
  const [studies, setStudies] = useState<any[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showInstallationForm, setShowInstallationForm] = useState(false);
  const [editingInstallation, setEditingInstallation] = useState<Installation | undefined>();

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    fetchTabData();
  }, [activeTab]);

  const fetchAllData = async () => {
    try {
      const [studiesRes, clientsRes, installationsRes, docsRes] = await Promise.all([
        axios.get("/api/studies"),
        axios.get("/api/clients"),
        axios.get("/api/installations"),
        axios.get("/api/documents")
      ]);
      setStudies(studiesRes.data);
      setClients(clientsRes.data);
      setInstallations(installationsRes.data);
      setDocuments(docsRes.data);
    } catch (error) {
      console.error("Error fetching initial data:", error);
    }
  };

  const fetchTabData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === "studies") {
        const res = await axios.get("/api/studies");
        setStudies(res.data);
      } else if (activeTab === "clients") {
        const res = await axios.get("/api/clients");
        setClients(res.data);
      } else if (activeTab === "installations") {
        const res = await axios.get("/api/installations");
        console.log("Fetched installations:", res.data);
        setInstallations(res.data);
      } else if (activeTab === "documents") {
        const res = await axios.get("/api/documents");
        setDocuments(res.data);
      }
    } catch (error) {
      console.error("Error fetching tab data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-10">
      {/* Sidebar */}
      <aside className="w-full lg:w-72 shrink-0">
        <div className="glass-card rounded-[2.5rem] p-8 space-y-2 border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
          <div className="px-4 mb-8">
            <p className="text-[10px] font-bold text-brand-navy/30 uppercase tracking-[0.2em]">Menú Principal</p>
          </div>
          
          {[
            { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
            { id: "studies", icon: Zap, label: "Estudios" },
            { id: "clients", icon: Users, label: "Clientes" },
            { id: "installations", icon: MapPin, label: "Instalaciones" },
            { id: "documents", icon: FileText, label: "Documentos" },
            { id: "settings", icon: Settings, label: "Configuración" }
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold transition-all duration-300 group",
                activeTab === item.id 
                  ? "brand-gradient text-brand-navy shadow-lg shadow-brand-mint/20" 
                  : "text-brand-navy/60 hover:bg-brand-navy/5 hover:text-brand-navy"
              )}
            >
              <item.icon className={cn("w-5 h-5 transition-transform duration-300 group-hover:scale-110", activeTab === item.id ? "text-brand-navy" : "text-brand-navy/40")} />
              {item.label}
            </button>
          ))}
          
          <div className="pt-12">
            <button className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all group">
              <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 space-y-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-sky/10 text-brand-navy text-[10px] font-bold uppercase tracking-widest mb-2">
              <Sparkles className="w-3 h-3 text-brand-sky" />
              Panel Administrativo
            </div>
            <h1 className="text-4xl font-bold text-brand-navy capitalize">{activeTab}</h1>
          </div>
          
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/20" />
              <input 
                type="text" 
                placeholder="Buscar estudios..." 
                className="pl-12 pr-6 py-3 rounded-2xl border border-brand-navy/5 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-mint/20 w-full md:w-64 shadow-sm"
              />
            </div>
            <Button variant="outline" size="sm" className="rounded-xl border-brand-navy/5 bg-white font-bold">
              <Filter className="w-4 h-4 mr-2" /> Filtros
            </Button>
            {activeTab === "installations" && (
              <Button 
                size="sm" 
                onClick={() => {
                  setEditingInstallation(undefined);
                  setShowInstallationForm(true);
                }}
                className="brand-gradient text-brand-navy border-none font-bold rounded-xl shadow-lg shadow-brand-mint/20"
              >
                Nueva Instalación
              </Button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { label: "Estudios Totales", value: studies.length.toString(), change: "En tiempo real", icon: FileText, color: "brand-sky" },
            { label: "Clientes Registrados", value: clients.length.toString(), change: "Base de datos activa", icon: Users, color: "brand-mint" },
            { label: "Instalaciones", value: installations.length.toString(), change: "Plantas solares", icon: MapPin, color: "brand-navy" }
          ].map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-8 bg-white rounded-[2.5rem] border border-brand-navy/5 shadow-xl shadow-brand-navy/5 relative overflow-hidden group"
            >
              <div className={cn("absolute top-0 right-0 w-24 h-24 opacity-5 blur-2xl rounded-full -mr-12 -mt-12 transition-all duration-500 group-hover:scale-150", `bg-${stat.color}`)} />
              <div className="flex justify-between items-start mb-6">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", `bg-${stat.color}/10 text-${stat.color}`)}>
                  <stat.icon className="w-6 h-6" />
                </div>
              </div>
              <p className="text-[10px] font-bold text-brand-navy/30 uppercase tracking-[0.2em] mb-1">{stat.label}</p>
              <p className="text-3xl font-bold text-brand-navy">{stat.value}</p>
              <p className={cn("text-[10px] font-bold mt-3 uppercase tracking-wider", i === 2 ? "text-brand-navy/40" : "text-brand-mint")}>
                {stat.change}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-[3rem] border border-brand-navy/5 shadow-2xl shadow-brand-navy/5 overflow-hidden min-h-[400px] flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-brand-navy/30">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest">Cargando datos reales...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-navy/[0.02] border-b border-brand-navy/5">
                    {activeTab === "studies" && (
                      <>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Cliente</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Tipo</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Estado</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Ahorro Est.</th>
                      </>
                    )}
                    {activeTab === "clients" && (
                      <>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Nombre</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Email</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Teléfono</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Estado</th>
                      </>
                    )}
                    {activeTab === "installations" && (
                      <>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Nombre</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Código</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Potencia</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Estado</th>
                      </>
                    )}
                    {activeTab === "documents" && (
                      <>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Archivo</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Cliente</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Tipo</th>
                        <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em]">Estado</th>
                      </>
                    )}
                    <th className="px-8 py-6 text-[10px] font-bold text-brand-navy/40 uppercase tracking-[0.2em] text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-navy/5">
                  <AnimatePresence mode="wait">
                    {activeTab === "studies" && studies.map((study, i) => (
                      <motion.tr 
                        key={study._id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: i * 0.05 }}
                        className="hover:bg-brand-navy/[0.01] transition-colors group"
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center font-bold text-brand-navy text-xs">
                              {(study.clientData?.name || "C").charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-brand-navy group-hover:text-brand-mint transition-colors">{study.clientData?.name} {study.clientData?.lastName}</p>
                              <div className="flex items-center gap-2 text-[10px] text-brand-navy/40 font-bold uppercase tracking-wider mt-0.5">
                                <Calendar className="w-3 h-3" />
                                {new Date(study.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-mint/10 text-brand-mint">
                            {study.clientType}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-brand-mint animate-pulse" />
                            <span className="text-xs font-bold text-brand-navy/60">{study.status}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <p className="text-sm font-bold text-brand-navy">{formatCurrency(study.results?.annualSavings || 0)}/año</p>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button className="p-3 hover:bg-brand-navy/5 rounded-xl transition-all text-brand-navy/40 hover:text-brand-navy">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button className="p-3 hover:bg-red-50 rounded-xl transition-all text-brand-navy/40 hover:text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}

                    {activeTab === "clients" && clients.map((client, i) => (
                      <motion.tr 
                        key={client._id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: i * 0.05 }}
                        className="hover:bg-brand-navy/[0.01] transition-colors group"
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center font-bold text-brand-navy text-xs">
                              {client.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-brand-navy">{client.name} {client.lastname1}</p>
                              <p className="text-[10px] text-brand-navy/40 font-bold uppercase tracking-wider">{client.dni}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-sm text-brand-navy/60">{client.email}</td>
                        <td className="px-8 py-6 text-sm text-brand-navy/60">{client.phone}</td>
                        <td className="px-8 py-6">
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-sky/10 text-brand-sky">
                            {client.status}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button className="p-3 hover:bg-brand-navy/5 rounded-xl transition-all text-brand-navy/40 hover:text-brand-navy">
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}

                    {activeTab === "installations" && installations.map((inst, i) => (
                      <motion.tr 
                        key={inst._id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: i * 0.05 }}
                        className="hover:bg-brand-navy/[0.01] transition-colors group"
                      >
                        <td className="px-8 py-6">
                          <p className="text-sm font-bold text-brand-navy">{inst.name}</p>
                        </td>
                        <td className="px-8 py-6 text-sm text-brand-navy/60">{inst.code}</td>
                        <td className="px-8 py-6 text-sm font-bold text-brand-navy">{inst.totalGeneratedPowerKwp} kWp</td>
                        <td className="px-8 py-6">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                            inst.status === "active" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                          )}>
                            {inst.status}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => {
                                setEditingInstallation(inst);
                                setShowInstallationForm(true);
                              }}
                              className="p-3 hover:bg-brand-navy/5 rounded-xl transition-all text-brand-navy/40 hover:text-brand-navy"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}

                    {activeTab === "documents" && documents.map((doc, i) => (
                      <motion.tr 
                        key={doc._id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: i * 0.05 }}
                        className="hover:bg-brand-navy/[0.01] transition-colors group"
                      >
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-brand-navy/30" />
                            <p className="text-sm font-bold text-brand-navy">{doc.fileName}</p>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-sm text-brand-navy/60">
                          {doc.client?.name || "Sin cliente"}
                        </td>
                        <td className="px-8 py-6">
                          <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-brand-navy/5 text-brand-navy/40">
                            {doc.type}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <span className="text-xs font-bold text-brand-navy/60">{doc.status}</span>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <a 
                              href={doc.webViewLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="p-3 hover:bg-brand-navy/5 rounded-xl transition-all text-brand-navy/40 hover:text-brand-navy"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
          
          <div className="p-8 bg-brand-navy/[0.01] border-t border-brand-navy/5 flex justify-between items-center mt-auto">
            <p className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest">
              {activeTab === "studies" && `Mostrando ${studies.length} estudios`}
              {activeTab === "clients" && `Mostrando ${clients.length} clientes`}
              {activeTab === "installations" && `Mostrando ${installations.length} instalaciones`}
              {activeTab === "documents" && `Mostrando ${documents.length} documentos`}
            </p>
          </div>
        </div>

        {showInstallationForm && (
          <InstallationForm 
            onClose={() => setShowInstallationForm(false)}
            onSuccess={() => {
              setShowInstallationForm(false);
              fetchTabData();
              fetchAllData();
            }}
            initialData={editingInstallation}
          />
        )}
      </div>
    </div>
  );
}
