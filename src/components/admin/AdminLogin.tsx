import React, { useState, useEffect } from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import { sileo } from "sileo";
import { motion } from "motion/react";

export default function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ALT + SHIFT + A
      if (e.altKey && e.shiftKey && e.key === "A") {
        setEmail("test1@sapiensenergia.es");
        setPassword("Sapiens2026.");
        sileo.success({ title: "Credenciales autocompletadas" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    sileo.promise(
      new Promise((resolve, reject) => {
        setTimeout(() => {
          if (email === "test1@sapiensenergia.es" && password === "Sapiens2026.") {
            resolve(true);
          } else {
            reject(new Error("Credenciales incorrectas"));
          }
        }, 1500);
      }).then(() => {
        onLogin();
      }),
      {
        loading: { title: "Verificando credenciales..." },
        success: { title: "Acceso concedido. Bienvenido al panel." },
        error: { title: "Credenciales incorrectas" }
      }
    ).finally(() => {
      setIsLoading(false);
    });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[3rem] border border-brand-navy/5 p-12 shadow-2xl shadow-brand-navy/5 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 brand-gradient opacity-10 blur-3xl rounded-full -mr-16 -mt-16" />
        
        <div className="text-center mb-10 relative z-10">
          <div className="w-20 h-20 brand-gradient rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-brand-mint/20">
            <ShieldCheck className="text-brand-navy w-10 h-10" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-navy/5 text-brand-navy text-[10px] font-bold uppercase tracking-widest mb-4">
            <Sparkles className="w-3 h-3 text-brand-mint" />
            Panel de Control
          </div>
          <h1 className="text-3xl font-bold text-brand-navy mb-2">Acceso Admin</h1>
          <p className="text-brand-gray text-sm">Gestiona los estudios y clientes de SolarStudy Pro</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
          <div className="space-y-4">
            <Input 
              label="Usuario" 
              placeholder="admin@solarstudy.pro" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input 
              label="Contraseña" 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <Button type="submit" className="w-full py-7 text-lg rounded-2xl brand-gradient text-brand-navy border-none font-bold" isLoading={isLoading}>
            Iniciar Sesión
          </Button>
          
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-brand-navy/20">
            Conexión Segura SSL
          </p>
        </form>
      </motion.div>
    </div>
  );
}
