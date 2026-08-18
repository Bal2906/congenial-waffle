import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ExtractedQuestion } from './parser';

export function exportStudyPdf(questions: ExtractedQuestion[]) {
  if (!questions || questions.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Title
  doc.setFillColor(30, 41, 59); // Dark blue header bar #1e293b
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('GUÍA DE ESTUDIO - CUESTIONARIO SIMULADOR', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`Fecha de generación: ${new Date().toLocaleDateString('es-ES')} | Total preguntas: ${questions.length}`, 14, 21);

  // Table rows formatting
  const tableData = questions.map((q, idx) => [
    `${idx + 1}`,
    q.question,
    q.correctAnswer
  ]);

  autoTable(doc, {
    startY: 34,
    head: [['#', 'Pregunta', 'Respuesta Correcta']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [99, 102, 241], // Primary indigo accent #6366f1
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 12, fontStyle: 'bold', halign: 'center' },
      1: { cellWidth: 'auto', fontSize: 9, fontStyle: 'bold', textColor: [30, 41, 59] },
      2: { cellWidth: 70, fontSize: 9, fontStyle: 'bold', textColor: [16, 185, 129] } // Green correct answer
    },
    styles: {
      cellPadding: 4,
      overflow: 'linebreak',
      valign: 'middle'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const totalPages = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Página ${data.pageNumber} de ${totalPages} • Documento de Estudio Offline`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
  });

  doc.save(`Guia_de_Estudio_Preguntas_${Date.now()}.pdf`);
}
