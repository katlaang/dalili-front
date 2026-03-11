import React, { useMemo, useState } from "react";
import { authApi } from "../../api/services";
import { ActionButton, Card, ChoiceChips, InlineActions, InputField, JsonPanel, MessageBanner } from "../../components/ui";
import { DEFAULT_KIOSK_DEVICE_ID, DEFAULT_KIOSK_DEVICE_SECRET } from "../../config/env";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

const staffRoleOptions = ["RECEPTIONIST", "NURSE", "PHYSICIAN", "PHARMACIST", "LAB_TECHNICIAN"] as const;

export function AdminScreen() {
  const { apiContext, role } = useSession();

  const [adminFullName, setAdminFullName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminCompany, setAdminCompany] = useState("Dalili Health Clinic");
  const [adminResult, setAdminResult] = useState<unknown>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminTone, setAdminTone] = useState<"error" | "success">("success");

  const [staffUsername, setStaffUsername] = useState("");
  const [staffFullName, setStaffFullName] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState<(typeof staffRoleOptions)[number]>("NURSE");
  const [staffResult, setStaffResult] = useState<unknown>(null);
  const [staffMessage, setStaffMessage] = useState<string | null>(null);
  const [staffTone, setStaffTone] = useState<"error" | "success">("success");

  const [kioskDeviceId, setKioskDeviceId] = useState(DEFAULT_KIOSK_DEVICE_ID);
  const [kioskDeviceSecret, setKioskDeviceSecret] = useState(DEFAULT_KIOSK_DEVICE_SECRET);
  const [kioskLocationDescription, setKioskLocationDescription] = useState("Front Desk 1");
  const [kioskResult, setKioskResult] = useState<unknown>(null);
  const [kioskMessage, setKioskMessage] = useState<string | null>(null);
  const [kioskTone, setKioskTone] = useState<"error" | "success">("success");

  const operatorRole = (role || "").toUpperCase();
  const canCreateAdmins = useMemo(() => operatorRole === "SUPER_ADMIN", [operatorRole]);

  if (!apiContext) {
    return (
      <Card title="Administration">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  const registerAdmin = async () => {
    try {
      setAdminMessage(null);
      const response = await authApi.registerAdmin(apiContext, {
        fullName: adminFullName.trim(),
        password: adminPassword,
        company: adminCompany.trim()
      });
      setAdminResult(response);
      setAdminPassword("");
      setAdminMessage(`Admin created. Username: ${response.username}`);
      setAdminTone("success");
    } catch (error) {
      setAdminMessage(toErrorMessage(error));
      setAdminTone("error");
    }
  };

  const registerStaff = async () => {
    try {
      setStaffMessage(null);
      const response = await authApi.registerStaff(apiContext, {
        username: staffUsername.trim(),
        password: staffPassword,
        fullName: staffFullName.trim(),
        role: staffRole
      });
      setStaffResult(response);
      setStaffPassword("");
      setStaffMessage(`Staff user created: ${staffUsername.trim()} (${staffRole})`);
      setStaffTone("success");
    } catch (error) {
      setStaffMessage(toErrorMessage(error));
      setStaffTone("error");
    }
  };

  const registerKiosk = async () => {
    try {
      setKioskMessage(null);
      const response = await authApi.registerKiosk(apiContext, {
        deviceId: kioskDeviceId.trim(),
        deviceSecret: kioskDeviceSecret,
        locationDescription: kioskLocationDescription.trim()
      });
      setKioskResult(response);
      setKioskMessage(`Kiosk registered: ${kioskDeviceId.trim()}`);
      setKioskTone("success");
    } catch (error) {
      setKioskMessage(toErrorMessage(error));
      setKioskTone("error");
    }
  };

  return (
    <>
      <Card title="Test Flow Setup">
        <JsonPanel
          value={{
            step1: "Register one kiosk device in 'Kiosk Device Registration'.",
            step2: "Register at least one NURSE and one PHYSICIAN in 'Staff Registration'.",
            step3: "Open kiosk in one browser profile/tab and complete check-in to issue queue number.",
            step4: "Open staff workspace in another profile (or incognito) as NURSE to view waiting queue.",
            step5: "Switch role view to PHYSICIAN and open Encounters to test ambient AI on selected patient.",
            note: "Web tabs in one browser profile share stored session. Use separate profiles/incognito to keep kiosk and staff logged in at the same time."
          }}
        />
      </Card>

      <Card title="Kiosk Device Registration">
        <InputField label="Device ID" value={kioskDeviceId} onChangeText={setKioskDeviceId} placeholder="kiosk-front-desk-1" />
        <InputField
          label="Device Secret"
          value={kioskDeviceSecret}
          onChangeText={setKioskDeviceSecret}
          secureTextEntry
          placeholder="kiosk-secret-change-me"
        />
        <InputField
          label="Location Description"
          value={kioskLocationDescription}
          onChangeText={setKioskLocationDescription}
          placeholder="Front Desk 1"
        />
        <InlineActions>
          <ActionButton label="Register Kiosk Device" onPress={registerKiosk} />
        </InlineActions>
        <MessageBanner message={kioskMessage} tone={kioskTone} />
      </Card>

      <Card title="Staff Registration">
        <InputField label="Username" value={staffUsername} onChangeText={setStaffUsername} placeholder="nurse.anna" />
        <InputField label="Full Name" value={staffFullName} onChangeText={setStaffFullName} placeholder="Anna Nurse" />
        <InputField label="Temporary Password" value={staffPassword} onChangeText={setStaffPassword} secureTextEntry />
        <ChoiceChips label="Role" options={staffRoleOptions} value={staffRole} onChange={(value) => setStaffRole(value as (typeof staffRoleOptions)[number])} />
        <InlineActions>
          <ActionButton label="Register Staff User" onPress={registerStaff} />
        </InlineActions>
        <MessageBanner message={staffMessage} tone={staffTone} />
      </Card>

      <Card title="Admin Registration">
        <MessageBanner
          message={canCreateAdmins ? "Super admin privileges detected." : "Only SUPER_ADMIN can create ADMIN accounts."}
          tone={canCreateAdmins ? "success" : "error"}
        />
        <InputField label="Admin Full Name" value={adminFullName} onChangeText={setAdminFullName} placeholder="Jane Doe" />
        <InputField label="Temporary Password" value={adminPassword} onChangeText={setAdminPassword} secureTextEntry />
        <InputField label="Company / Clinic Name" value={adminCompany} onChangeText={setAdminCompany} />
        <InlineActions>
          <ActionButton label="Register Admin" onPress={registerAdmin} disabled={!canCreateAdmins} />
        </InlineActions>
        <MessageBanner message={adminMessage} tone={adminTone} />
      </Card>

      {kioskResult ? (
        <Card title="Kiosk Registration Result">
          <JsonPanel value={kioskResult} />
        </Card>
      ) : null}
      {staffResult ? (
        <Card title="Staff Registration Result">
          <JsonPanel value={staffResult} />
        </Card>
      ) : null}
      {adminResult ? (
        <Card title="Admin Registration Result">
          <JsonPanel value={adminResult} />
        </Card>
      ) : null}
    </>
  );
}
