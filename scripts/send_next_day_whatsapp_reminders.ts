import "dotenv/config";
import { sendTomorrowAppointmentReminders } from "../server/db_complete";

async function main() {
  const userId = Number(process.env.WHATSAPP_REMINDER_USER_ID || "1");
  const baseUrl = process.env.APP_URL || "https://sistema.drwesleycamara.com.br";

  const result = await sendTomorrowAppointmentReminders(userId, baseUrl);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[whatsapp-reminders]", error);
    process.exit(1);
  });
