/**
 * Lembrete mensal: atualizar alíquota do Simples Nacional
 *
 * Aparece automaticamente todo mês e só desaparece quando o usuário
 * confirma que já atualizou o valor nas configurações fiscais.
 *
 * Persiste em localStorage: { confirmed: true } por chave "simples_reminder_YYYY-MM"
 */

import { useState, useEffect } from "react";
import { RefreshCw, X, CheckCircle2, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

function getReminderKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `simples_reminder_${now.getFullYear()}-${month}`;
}

function isConfirmedThisMonth() {
  try {
    return localStorage.getItem(getReminderKey()) === "confirmed";
  } catch {
    return false;
  }
}

function confirmThisMonth() {
  try {
    localStorage.setItem(getReminderKey(), "confirmed");
  } catch {}
}

export function SimplesNacionalReminder() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Show reminder every month until confirmed
    if (!isConfirmedThisMonth()) {
      setVisible(true);
    }
  }, []);

  if (!visible || dismissed) return null;

  const handleConfirm = () => {
    confirmThisMonth();
    setVisible(false);
  };

  const handleGoToFiscal = () => {
    setLocation("/configuracoes-fiscais");
  };

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <RefreshCw size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
            Lembrete mensal — Alíquota do Simples Nacional
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
            Verifique e atualize a alíquota do Simples Nacional nas configurações fiscais.
            O valor muda mensalmente conforme a DAS do mês.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-7">
        <button
          type="button"
          onClick={handleGoToFiscal}
          className="flex items-center gap-1 rounded-lg border border-amber-400/50 bg-white dark:bg-amber-900/30 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/40 transition-colors"
        >
          Ir para configurações
          <ChevronRight size={12} />
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
        >
          <CheckCircle2 size={12} />
          Já atualizei
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Fechar lembrete"
          className="ml-1 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
