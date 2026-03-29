import React, { useMemo, useState } from "react";
import { authApi } from "../../api/services";
import { ActionButton, Card, ChoiceChips, InlineActions, InputField, JsonPanel, MessageBanner } from "../../components/ui";
import { DEFAULT_KIOSK_DEVICE_ID, DEFAULT_KIOSK_DEVICE_SECRET } from "../../config/env";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

type ProfileType = "STAFF" | "CONSULTANT" | "PATIENT";
type StaffRoleOption = "NURSE" | "RECEPTIONIST";

const profileTypeOptions: ProfileType[] = ["STAFF", "CONSULTANT", "PATIENT"];
const staffRoleOptions: StaffRoleOption[] = ["NURSE", "RECEPTIONIST"];
const clinicOptions = ["Dalili Health Clinic", "Sunrise Community Clinic"] as const;

function hasPrefix(value: string, prefix: string) {
  return value.trim().toUpperCase().startsWith(prefix.toUpperCase());
}

export function AdminScreen() {
  const { apiContext, role } = useSession();

  const [profileType, setProfileType] = useState<ProfileType>("STAFF");

  const [adminUsername, setAdminUsername] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminCompany, setAdminCompany] = useState("Dalili Health Clinic");
  const [adminResult, setAdminResult] = useState<unknown>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminTone, setAdminTone] = useState<"error" | "success">("success");

  const [staffUsername, setStaffUsername] = useState("");
  const [staffFirstName, setStaffFirstName] = useState("");
  const [staffLastName, setStaffLastName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRoleOption>("NURSE");
  const [patientProfileId, setPatientProfileId] = useState("");
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

  const effectiveStaffRole = profileType === "CONSULTANT" ? "PHYSICIAN" : staffRole;
  const requiredStaffPrefix = effectiveStaffRole === "PHYSICIAN" ? "CL" : effectiveStaffRole === "NURSE" ? "NS" : "RC";

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
      if (!hasPrefix(adminUsername, "AD")) {
        throw new Error("Admin usernames must start with AD.");
      }
      const response = await authApi.registerAdmin(apiContext, {
        username: adminUsername.trim(),
        firstName: adminFirstName.trim(),
        lastName: adminLastName.trim(),
        email: adminEmail.trim(),
        password: adminPassword,
        company: adminCompany.trim()
      });
      setAdminResult(response);
      setAdminPassword("");
      setAdminMessage(`Admin profile created. Username: ${response.username}`);
      setAdminTone("success");
    } catch (error) {
      setAdminMessage(toErrorMessage(error));
      setAdminTone("error");
    }
  };

  const registerStaffOrConsultant = async () => {
    try {
      setStaffMessage(null);
      if (!hasPrefix(staffUsername, requiredStaffPrefix)) {
        throw new Error(`Username must start with ${requiredStaffPrefix}.`);
      }

      const response = await authApi.registerStaff(apiContext, {
        username: staffUsername.trim(),
        password: staffPassword,
        firstName: staffFirstName.trim(),
        lastName: staffLastName.trim(),
        email: staffEmail.trim(),
        role: effectiveStaffRole
      });
      setStaffPassword("");
      setStaffMessage(`Profile created: ${staffUsername.trim()} (${effectiveStaffRole}).`);
      setStaffTone("success");
    } catch (error) {
      setStaffMessage(toErrorMessage(error));
      setStaffTone("error");
    }
  };

  const registerPatientPortalUser = async () => {
    try {
      setStaffMessage(null);
      const response = await authApi.registerPatientUser(apiContext, {
        username: staffUsername.trim(),
        password: staffPassword,
        patientId: patientProfileId.trim()
      });
      setStaffPassword("");
      setStaffMessage("Patient portal profile created.");
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
      <Card title="Admin Portal">
        <MessageBanner
          message="Create staff and consultant accounts here. Patient portal profiles are only created for existing patients after their first visit."
          tone="info"
        />
      </Card>

      <Card title="Profile Creation">
        <ChoiceChips
          label="Profile Type"
          options={profileTypeOptions}
          value={profileType}
          onChange={(value) => setProfileType(value as ProfileType)}
        />

        <InputField
          label="Username"
          value={staffUsername}
          onChangeText={setStaffUsername}
          placeholder={profileType === "PATIENT" ? "PT-..." : `${requiredStaffPrefix}-...`}
        />
        {profileType === "STAFF" ? (
          <MessageBanner message="Nurse usernames must start with NS. Receptionist usernames must start with RC." tone="info" />
        ) : null}
        {profileType === "CONSULTANT" ? (
          <MessageBanner message="Clinician usernames must start with CL." tone="info" />
        ) : null}
        <InputField label="Temporary Password" value={staffPassword} onChangeText={setStaffPassword} secureTextEntry />

        {profileType === "PATIENT" ? (
          <>
            <InputField
              label="Existing Patient Record ID"
              value={patientProfileId}
              onChangeText={setPatientProfileId}
              placeholder="Enter the existing patient record ID"
            />
            <MessageBanner
              message="Do not create patient portal access until the patient has already been registered during a real visit."
              tone="info"
            />
            <InlineActions>
              <ActionButton label="Create Patient Portal Profile" onPress={registerPatientPortalUser} />
            </InlineActions>
          </>
        ) : (
          <>
            <InputField label="First Name" value={staffFirstName} onChangeText={setStaffFirstName} placeholder="First name" />
            <InputField label="Last Name" value={staffLastName} onChangeText={setStaffLastName} placeholder="Last name" />
            <InputField label="Email" value={staffEmail} onChangeText={setStaffEmail} placeholder="name@clinic.com" />
            {profileType === "STAFF" ? (
              <ChoiceChips
                label="Staff Role"
                options={staffRoleOptions}
                value={staffRole}
                onChange={(value) => setStaffRole(value as StaffRoleOption)}
              />
            ) : (
              <ChoiceChips label="Consultant Role" options={["CLINICIAN"]} value="CLINICIAN" onChange={() => undefined} />
            )}
            <InlineActions>
              <ActionButton label={`Create ${profileType} Profile`} onPress={registerStaffOrConsultant} />
            </InlineActions>
          </>
        )}

        <MessageBanner message={staffMessage} tone={staffTone} />
      </Card>

      <Card title="Admin Registration">
        <MessageBanner
          message={canCreateAdmins ? "Create admin profiles (role is fixed to ADMIN)." : "Current account cannot create admin profiles."}
          tone={canCreateAdmins ? "success" : "error"}
        />
        <MessageBanner message="Admin usernames must start with AD." tone="info" />
        <InputField label="Admin Username (AD...)" value={adminUsername} onChangeText={setAdminUsername} placeholder="AD-001" />
        <InputField label="Admin First Name" value={adminFirstName} onChangeText={setAdminFirstName} placeholder="First name" />
        <InputField label="Admin Last Name" value={adminLastName} onChangeText={setAdminLastName} placeholder="Last name" />
        <InputField label="Admin Email" value={adminEmail} onChangeText={setAdminEmail} placeholder="admin@clinic.com" />
        <InputField label="Temporary Password" value={adminPassword} onChangeText={setAdminPassword} secureTextEntry />
        <ChoiceChips
          label="Company / Clinic Name"
          options={clinicOptions}
          value={adminCompany}
          onChange={(value) => setAdminCompany(value)}
        />
        <InputField label="Company / Clinic Name" value={adminCompany} onChangeText={setAdminCompany} />
        <InlineActions>
          <ActionButton label="Create Admin Profile" onPress={registerAdmin} disabled={!canCreateAdmins} />
        </InlineActions>
        <MessageBanner message={adminMessage} tone={adminTone} />
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

      {kioskResult ? (
        <Card title="Kiosk Registration Result">
          <JsonPanel value={kioskResult} />
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
