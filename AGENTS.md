# Agente Operativo - Regole di Sviluppo



## Sicurezza e Privacy (REGOLE CRITICHE)



1. **Codice Univoco Dipendente (Login):** Il codice univoco dipendente (utilizzato per il login dell'app mobile) è un dato sensibile strettamente riservato.

   - **MAI E POI MAI** stampare questo codice in qualsiasi documento PDF generato dall'applicazione.

   - Questa regola è permanente e non può essere modificata o ignorata in versioni future del software.

   - Nelle interfacce UI (Dashboard), deve essere oscurato (es. con asterischi) per impostazione predefinita, con possibilità di visualizzazione solo tramite interazione esplicita dell'amministratore (es. tasto "occhio").