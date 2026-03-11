import React, { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { appointmentApi, patientApi } from "../../api/services";
import { sexOptions } from "../../config/options";
import {
  ActionButton,
  Card,
  ChoiceChips,
  InlineActions,
  InputField,
  JsonPanel,
  MessageBanner
} from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";

interface FullPatientForm {
  mrn: string;
  nationalId: string;
  givenName: string;
  middleName: string;
  familyName: string;
  dateOfBirth: string;
  sex: string;
  phoneNumber: string;
  email: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

const defaultPatientForm: FullPatientForm = {
  mrn: "",
  nationalId: "",
  givenName: "",
  middleName: "",
  familyName: "",
  dateOfBirth: "",
  sex: "UNKNOWN",
  phoneNumber: "",
  email: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: ""
};

const toIsoDateTime = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }
  return parsed.toISOString();
};

export function PatientsScreen() {
  const { apiContext, role, username } = useSession();
  const [form, setForm] = useState<FullPatientForm>(defaultPatientForm);
  const [lookupMrn, setLookupMrn] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [lookupDob, setLookupDob] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [patientResult, setPatientResult] = useState<unknown>(null);
  const [appointmentDateTime, setAppointmentDateTime] = useState("");
  const [appointmentReason, setAppointmentReason] = useState("");
  const [appointmentClinicianName, setAppointmentClinicianName] = useState("");
  const [appointmentClinicianEmployeeId, setAppointmentClinicianEmployeeId] = useState("");
  const [appointmentResult, setAppointmentResult] = useState<unknown>(null);

  useEffect(() => {
    if ((role === "PHYSICIAN" || role === "NURSE") && username) {
      setAppointmentClinicianName((previous) => previous || username);
      setAppointmentClinicianEmployeeId((previous) => previous || username);
    }
  }, [role, username]);

  if (!apiContext) {
    return (
      <Card title="Patients">
        <MessageBanner message="No authenticated session." tone="error" />
      </Card>
    );
  }

  const onFormChange = (field: keyof FullPatientForm, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const showError = (error: unknown) => {
    setMessage(toErrorMessage(error));
    setMessageTone("error");
  };

  const showSuccess = (text: string) => {
    setMessage(text);
    setMessageTone("success");
  };

  const registerPatient = async () => {
    try {
      const payload = {
        ...form,
        nationalId: form.nationalId || null,
        middleName: form.middleName || null,
        phoneNumber: form.phoneNumber || null,
        email: form.email || null,
        address: form.address || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null
      };
      const created = await patientApi.registerFull(apiContext, payload);
      setPatientResult(created);
      setSelectedPatientId(created.id);
      showSuccess("Patient registered");
    } catch (error) {
      showError(error);
    }
  };

  const lookupByMrn = async () => {
    try {
      const patient = await patientApi.getByMrn(apiContext, lookupMrn.trim());
      setPatientResult(patient);
      setSelectedPatientId(patient.id);
      showSuccess("Patient loaded by MRN");
    } catch (error) {
      showError(error);
    }
  };

  const lookupByMrnAndDob = async () => {
    try {
      if (!lookupDob.trim()) {
        throw new Error("Date of birth is required");
      }
      const patient = await patientApi.getByMrn(apiContext, lookupMrn.trim());
      if (patient.dateOfBirth !== lookupDob.trim()) {
        throw new Error("Patient number and date of birth do not match");
      }
      setPatientResult(patient);
      setSelectedPatientId(patient.id);
      showSuccess("Patient verified by number + DOB");
    } catch (error) {
      showError(error);
    }
  };

  const lookupById = async () => {
    try {
      const patient = await patientApi.getById(apiContext, lookupId.trim());
      setPatientResult(patient);
      setSelectedPatientId(patient.id);
      showSuccess("Patient loaded by ID");
    } catch (error) {
      showError(error);
    }
  };

  const updateContact = async () => {
    try {
      const patient = await patientApi.updateContact(apiContext, selectedPatientId.trim(), {
        phoneNumber: phoneNumber || undefined,
        email: email || undefined,
        address: address || undefined
      });
      setPatientResult(patient);
      showSuccess("Contact updated");
    } catch (error) {
      showError(error);
    }
  };

  const updateEmergency = async () => {
    try {
      const patient = await patientApi.updateEmergencyContact(apiContext, selectedPatientId.trim(), {
        name: emergencyName || undefined,
        phone: emergencyPhone || undefined
      });
      setPatientResult(patient);
      showSuccess("Emergency contact updated");
    } catch (error) {
      showError(error);
    }
  };

  const giveConsent = async () => {
    try {
      const patient = await patientApi.recordConsent(apiContext, selectedPatientId.trim());
      setPatientResult(patient);
      showSuccess("Consent recorded");
    } catch (error) {
      showError(error);
    }
  };

  const bookAppointment = async () => {
    try {
      const patientId = selectedPatientId.trim();
      if (!patientId) {
        throw new Error("Patient ID is required");
      }
      if (!appointmentDateTime.trim()) {
        throw new Error("Appointment date/time is required");
      }

      const created = await appointmentApi.schedule(apiContext, {
        patientId,
        scheduledAt: toIsoDateTime(appointmentDateTime),
        clinicianName: appointmentClinicianName.trim() || undefined,
        clinicianEmployeeId: appointmentClinicianEmployeeId.trim() || undefined,
        reason: appointmentReason.trim() || undefined
      });
      setAppointmentResult(created);
      showSuccess(`Appointment booked. Appointment number: ${created.appointmentNumber || created.id}`);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <>
      <Card title="Register Full Patient">
        <InputField label="MRN" value={form.mrn} onChangeText={(value) => onFormChange("mrn", value)} placeholder="MRN-0001" />
        <InputField label="National ID" value={form.nationalId} onChangeText={(value) => onFormChange("nationalId", value)} />
        <InputField label="Given Name" value={form.givenName} onChangeText={(value) => onFormChange("givenName", value)} />
        <InputField label="Middle Name" value={form.middleName} onChangeText={(value) => onFormChange("middleName", value)} />
        <InputField label="Family Name" value={form.familyName} onChangeText={(value) => onFormChange("familyName", value)} />
        <InputField label="Date of Birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={(value) => onFormChange("dateOfBirth", value)} />
        <ChoiceChips label="Sex" options={sexOptions} value={form.sex} onChange={(value) => onFormChange("sex", value)} />
        <InputField label="Phone Number" value={form.phoneNumber} onChangeText={(value) => onFormChange("phoneNumber", value)} />
        <InputField label="Email" value={form.email} onChangeText={(value) => onFormChange("email", value)} />
        <InputField label="Address" value={form.address} onChangeText={(value) => onFormChange("address", value)} multiline />
        <InputField
          label="Emergency Contact Name"
          value={form.emergencyContactName}
          onChangeText={(value) => onFormChange("emergencyContactName", value)}
        />
        <InputField
          label="Emergency Contact Phone"
          value={form.emergencyContactPhone}
          onChangeText={(value) => onFormChange("emergencyContactPhone", value)}
        />
        <InlineActions>
          <ActionButton label="Register Patient" onPress={registerPatient} />
        </InlineActions>
        <MessageBanner message={message} tone={messageTone} />
      </Card>

      <Card title="Lookup Patient">
        <InputField label="Patient Number (MRN)" value={lookupMrn} onChangeText={setLookupMrn} />
        <InputField label="Date of Birth (YYYY-MM-DD)" value={lookupDob} onChangeText={setLookupDob} />
        <InlineActions>
          <ActionButton label="Find by MRN + DOB" onPress={lookupByMrnAndDob} variant="secondary" />
          <ActionButton label="Find by MRN" onPress={lookupByMrn} variant="ghost" />
        </InlineActions>
        <InputField label="Lookup by Patient UUID" value={lookupId} onChangeText={setLookupId} />
        <InlineActions>
          <ActionButton label="Find by ID" onPress={lookupById} variant="ghost" />
        </InlineActions>
      </Card>

      <Card title="Book Appointment">
        <InputField
          label="Patient UUID"
          value={selectedPatientId}
          onChangeText={setSelectedPatientId}
          placeholder="Loaded from patient lookup"
        />
        {Platform.OS === "web" ? (
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13 }}>Appointment Date & Time</Text>
            <input
              type="datetime-local"
              value={appointmentDateTime}
              onChange={(event) => setAppointmentDateTime(event.currentTarget.value)}
              style={{
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid #d8d2c8",
                padding: "10px 12px"
              }}
            />
          </View>
        ) : (
          <InputField
            label="Appointment Date & Time (ISO)"
            value={appointmentDateTime}
            onChangeText={setAppointmentDateTime}
            placeholder="2026-03-11T14:30:00"
          />
        )}
        <InputField label="Reason" value={appointmentReason} onChangeText={setAppointmentReason} multiline />
        <InputField
          label="Assigned Doctor/Nurse Name (optional)"
          value={appointmentClinicianName}
          onChangeText={setAppointmentClinicianName}
          placeholder="Dr. Jane Doe"
        />
        <InputField
          label="Assigned Doctor/Nurse ID (optional)"
          value={appointmentClinicianEmployeeId}
          onChangeText={setAppointmentClinicianEmployeeId}
          placeholder="PHY-1023"
        />
        <InlineActions>
          <ActionButton label="Book Appointment" onPress={bookAppointment} />
        </InlineActions>
      </Card>

      <Card title="Patient Updates">
        <InputField
          label="Patient UUID"
          value={selectedPatientId}
          onChangeText={setSelectedPatientId}
          placeholder="Use lookup result or paste ID"
        />
        <InputField label="Phone Number" value={phoneNumber} onChangeText={setPhoneNumber} />
        <InputField label="Email" value={email} onChangeText={setEmail} />
        <InputField label="Address" value={address} onChangeText={setAddress} />
        <InlineActions>
          <ActionButton label="Update Contact" onPress={updateContact} />
        </InlineActions>
        <InputField label="Emergency Contact Name" value={emergencyName} onChangeText={setEmergencyName} />
        <InputField label="Emergency Contact Phone" value={emergencyPhone} onChangeText={setEmergencyPhone} />
        <InlineActions>
          <ActionButton label="Update Emergency Contact" onPress={updateEmergency} variant="secondary" />
          <ActionButton label="Record Consent" onPress={giveConsent} variant="ghost" />
        </InlineActions>
      </Card>

      {appointmentResult ? (
        <Card title="Appointment Result">
          <JsonPanel value={appointmentResult} />
        </Card>
      ) : null}

      {patientResult ? (
        <Card title="Patient Result">
          <JsonPanel value={patientResult} />
        </Card>
      ) : null}
    </>
  );
}
