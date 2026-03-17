import emailjs from "@emailjs/browser";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "";
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";

export const sendStudyByEmail = async (toEmail: string, clientName: string, pdfUrl: string) => {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn("EmailJS not configured. Skipping email send.");
    return;
  }

  try {
    const response = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_name: clientName,
        to_email: toEmail,
        study_link: pdfUrl,
        message: "Adjuntamos tu estudio energético personalizado realizado con SolarStudy Pro.",
      },
      PUBLIC_KEY
    );
    return response;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};
