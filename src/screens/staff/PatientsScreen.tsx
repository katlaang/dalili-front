import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { appointmentApi, clinicalPortalApi, patientApi } from "../../api/services";
import type { AppointmentView, PatientResponse } from "../../api/types";
import { sexOptions } from "../../config/options";
import {
  AccessReasonModal,
  ActionButton,
  Card,
  ChoiceChips,
  InlineActions,
  InputField,
  Label,
  MessageBanner,
  useTheme,
} from "../../components/ui";
import { useSession } from "../../state/session";
import { toErrorMessage } from "../../utils/format";
import {
  getPrimaryVulnerabilityColor,
  getVulnerabilityBadgeColors,
  getVulnerabilityMarkers,
} from "../../utils/vulnerability";

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

const DOB_PLACEHOLDER = "MM/DD/YYYY";

const formatDobInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const isoToDobDisplay = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return "";
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
};

const isoToDobLongDisplay = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const dobDisplayToIso = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!displayMatch) {
    throw new Error(`Please enter date of birth as ${DOB_PLACEHOLDER}.`);
  }

  const [, monthValue, dayValue, yearValue] = displayMatch;
  const month = Number(monthValue);
  const day = Number(dayValue);
  const year = Number(yearValue);

  if (month < 1 || month > 12) {
    throw new Error("Month must be between 01 and 12.");
  }

  const lastDayOfMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > lastDayOfMonth) {
    throw new Error("Please enter a valid calendar date.");
  }

  return `${yearValue}-${monthValue}-${dayValue}`;
};

const tryDobToIso = (value: string) => {
  try {
    return dobDisplayToIso(value);
  } catch {
    return "";
  }
};

function DateOfBirthField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { theme: T } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const textInputRef = useRef<TextInput | null>(null);
  const webDateInputRef = useRef<HTMLInputElement | null>(null);
  const WebInput = "input" as any;
  const isoValue = tryDobToIso(value);
  const longDisplay = isoValue ? isoToDobLongDisplay(isoValue) : "";
  const showLongDisplay = !isEditing && !!longDisplay;

  useEffect(() => {
    if (!isEditing) return;
    const timeoutId = setTimeout(() => textInputRef.current?.focus(), 0);
    return () => clearTimeout(timeoutId);
  }, [isEditing]);

  const openCalendar = () => {
    const input = webDateInputRef.current;
    if (!input) return;

    if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
      (input as HTMLInputElement & { showPicker: () => void }).showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  return (
    <View style={patientsUi.field}>
      <Label>{label}</Label>
      <View style={patientsUi.dateRow}>
        {showLongDisplay ? (
          <Pressable
            onPress={() => setIsEditing(true)}
            style={[
              patientsUi.dateField,
              patientsUi.dateTextInput,
              { backgroundColor: T.inputBg, borderColor: T.border },
            ]}
          >
            <Text style={[patientsUi.dateReadonlyText, { color: T.text }]}>{longDisplay}</Text>
          </Pressable>
        ) : (
          <TextInput
            ref={textInputRef}
            value={value}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            onChangeText={(text) => onChangeText(formatDobInput(text))}
            placeholder={DOB_PLACEHOLDER}
            placeholderTextColor={T.textMuted}
            keyboardType="number-pad"
            maxLength={10}
            style={[
              patientsUi.dateField,
              patientsUi.dateTextInput,
              { backgroundColor: T.inputBg, borderColor: T.border, color: T.text },
            ]}
          />
        )}
        {Platform.OS === "web" && typeof document !== "undefined" ? (
          <View style={patientsUi.calendarWrap}>
            <Pressable
              onPress={openCalendar}
              style={[patientsUi.calendarBtn, { backgroundColor: T.inputBg, borderColor: T.border }]}
            >
              <Text style={patientsUi.calendarBtnText}>📅</Text>
            </Pressable>
            <WebInput
              type="date"
              ref={(node: HTMLInputElement | null) => {
                webDateInputRef.current = node;
              }}
              value={isoValue}
              onChange={(event: { target: { value: string } }) => {
                onChangeText(isoToDobDisplay(event.target.value));
                setIsEditing(false);
              }}
              aria-label={label}
              tabIndex={-1}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

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

const formatLongDate = (value?: string) => {
  if (!value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

const PATIENT_SECTIONS = ["register", "lookup", "appointments", "updates"] as const;
type PatientSection = (typeof PATIENT_SECTIONS)[number];

const PATIENT_SECTION_LABELS: Record<PatientSection, string> = {
  register: "Register Patient",
  lookup: "Lookup Patient",
  appointments: "Book Appointment",
  updates: "Patient Updates",
};

interface PatientsScreenProps {
  onOpenMessaging?: (patientId: string, patientName: string) => void;
  onOpenPatientAccess?: (patientId: string, patientName: string) => void;
}

export function PatientsScreen({ onOpenMessaging, onOpenPatientAccess }: PatientsScreenProps) {
  const { apiContext, role, username } = useSession();
  const { theme: T } = useTheme();
  const [section, setSection] = useState<PatientSection>("register");
  const [form, setForm] = useState<FullPatientForm>(defaultPatientForm);
  const [lookupMrn, setLookupMrn] = useState("");
  const [lookupDob, setLookupDob] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientResponse | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [appointmentDateTime, setAppointmentDateTime] = useState("");
  const [appointmentReason, setAppointmentReason] = useState("");
  const [appointmentClinicianName, setAppointmentClinicianName] = useState("");
  const [appointmentClinicianEmployeeId, setAppointmentClinicianEmployeeId] = useState("");
  const [appointmentResult, setAppointmentResult] = useState<AppointmentView | null>(null);
  const [accessModalVisible, setAccessModalVisible] = useState(false);

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

  const applyPatientSelection = (patient: PatientResponse) => {
    setSelectedPatient(patient);
    setPhoneNumber(patient.phoneNumber || "");
    setEmail(patient.email || "");
    setAddress(patient.address || "");
    setEmergencyName(patient.emergencyContactName || "");
    setEmergencyPhone(patient.emergencyContactPhone || "");
  };

  const requireSelectedPatient = () => {
    if (!selectedPatient) {
      throw new Error("Select a patient first using Patient Lookup.");
    }
    return selectedPatient;
  };

  const openMedicalRecord = async (reason: string, detail?: string) => {
    try {
      const patient = requireSelectedPatient();
      await clinicalPortalApi.recordChartAccess(apiContext, patient.id, {
        reason,
        detail: detail || null,
        viewedArea: "Patients",
        viewedResource: "Full Chart",
        accessScope: "CLINICAL_SUMMARY",
      });
      setAccessModalVisible(false);
      onOpenPatientAccess?.(patient.id, patient.fullName);
      showSuccess(`Access logged for ${patient.fullName}`);
    } catch (error) {
      showError(error);
    }
  };

  const registerPatient = async () => {
    try {
      const payload = {
        ...form,
        dateOfBirth: dobDisplayToIso(form.dateOfBirth),
        nationalId: form.nationalId || null,
        middleName: form.middleName || null,
        phoneNumber: form.phoneNumber || null,
        email: form.email || null,
        address: form.address || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactPhone: form.emergencyContactPhone || null
      };
      const created = await patientApi.registerFull(apiContext, payload);
      applyPatientSelection(created);
      setSection("updates");
      showSuccess("Patient registered");
    } catch (error) {
      showError(error);
    }
  };

  const lookupByMrn = async () => {
    try {
      const patient = await patientApi.getByMrn(apiContext, lookupMrn.trim());
      applyPatientSelection(patient);
      setSection("updates");
      showSuccess("Patient loaded by patient ID");
    } catch (error) {
      showError(error);
    }
  };

  const lookupByMrnAndDob = async () => {
    try {
      if (!lookupDob.trim()) {
        throw new Error("Date of birth is required");
      }
      const lookupDobIso = dobDisplayToIso(lookupDob);
      const patient = await patientApi.getByMrn(apiContext, lookupMrn.trim());
      if (patient.dateOfBirth !== lookupDobIso) {
        throw new Error("Patient number and date of birth do not match");
      }
      applyPatientSelection(patient);
      setSection("updates");
      showSuccess("Patient verified by patient ID and date of birth");
    } catch (error) {
      showError(error);
    }
  };

  const updateContact = async () => {
    try {
      const patient = requireSelectedPatient();
      const updated = await patientApi.updateContact(apiContext, patient.id, {
        phoneNumber: phoneNumber || undefined,
        email: email || undefined,
        address: address || undefined
      });
      applyPatientSelection(updated);
      showSuccess("Contact updated");
    } catch (error) {
      showError(error);
    }
  };

  const updateEmergency = async () => {
    try {
      const patient = requireSelectedPatient();
      const updated = await patientApi.updateEmergencyContact(apiContext, patient.id, {
        name: emergencyName || undefined,
        phone: emergencyPhone || undefined
      });
      applyPatientSelection(updated);
      showSuccess("Emergency contact updated");
    } catch (error) {
      showError(error);
    }
  };

  const giveConsent = async () => {
    try {
      const patient = requireSelectedPatient();
      const updated = await patientApi.recordConsent(apiContext, patient.id);
      applyPatientSelection(updated);
      showSuccess("Consent recorded");
    } catch (error) {
      showError(error);
    }
  };

  const bookAppointment = async () => {
    try {
      const patient = requireSelectedPatient();
      if (!appointmentDateTime.trim()) {
        throw new Error("Appointment date/time is required");
      }

      const created = await appointmentApi.schedule(apiContext, {
        patientId: patient.id,
        scheduledAt: toIsoDateTime(appointmentDateTime),
        clinicianName: appointmentClinicianName.trim() || undefined,
        clinicianEmployeeId: appointmentClinicianEmployeeId.trim() || undefined,
        reason: appointmentReason.trim() || undefined
      });
      setAppointmentResult(created);
      showSuccess(`Appointment booked. Appointment number: ${created.appointmentNumber || "Pending number"}`);
    } catch (error) {
      showError(error);
    }
  };

  const selectedPatientMarkers = selectedPatient
    ? getVulnerabilityMarkers({
        dateOfBirth: selectedPatient.dateOfBirth,
        ageYears: selectedPatient.ageYears,
        ageInDays: selectedPatient.ageInDays,
        pregnancyStatus: selectedPatient.pregnancyStatus,
        isPregnant: selectedPatient.isPregnant,
        manualRedFlag: selectedPatient.manualRedFlag,
        vulnerabilityIndicators: selectedPatient.vulnerabilityIndicators,
      })
    : [];
  const selectedPatientAccent = getPrimaryVulnerabilityColor(selectedPatientMarkers);

  return (
    <>
      <AccessReasonModal
        visible={accessModalVisible}
        title="Open Medical Record"
        patientLabel={selectedPatient ? `${selectedPatient.fullName} (${selectedPatient.mrn})` : undefined}
        resourceLabel="Full Chart"
        confirmLabel="Log Access and Open"
        onCancel={() => setAccessModalVisible(false)}
        onConfirm={({ reason, detail }) => void openMedicalRecord(reason, detail)}
      />

      <Card title="">
        <View style={patientsUi.sectionTabs}>
          {PATIENT_SECTIONS.map((item) => (
            <Pressable
              key={item}
              onPress={() => setSection(item)}
              style={[
                patientsUi.sectionTab,
                { borderColor: T.border, backgroundColor: T.surfaceAlt as string },
                section === item && { backgroundColor: T.teal, borderColor: T.teal },
              ]}
            >
              <Text
                style={[
                  patientsUi.sectionTabText,
                  { color: section === item ? "#fff" : T.textMid },
                ]}
              >
                {PATIENT_SECTION_LABELS[item]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {message ? (
        <Card title="">
          <MessageBanner message={message} tone={messageTone} />
        </Card>
      ) : null}

      {selectedPatient ? (
        <Card
          title="Selected Patient"
          style={selectedPatientAccent ? { borderLeftWidth: 4, borderLeftColor: selectedPatientAccent } : undefined}
        >
          {selectedPatientMarkers.length > 0 ? (
            <View style={patientsUi.vulnerabilityWrap}>
              {selectedPatientMarkers.map(marker => {
                const colors = getVulnerabilityBadgeColors(marker.tone);
                return (
                  <View
                    key={marker.key}
                    style={[
                      patientsUi.vulnerabilityBadge,
                      {
                        backgroundColor: colors.backgroundColor,
                        borderColor: colors.borderColor,
                      },
                    ]}
                  >
                    <Text style={[patientsUi.vulnerabilityBadgeText, { color: colors.color }]}>
                      {marker.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          <View style={patientsUi.summaryGrid}>
            {[
              ["Patient Name", selectedPatient.fullName],
              ["Patient ID", selectedPatient.mrn],
              ["Date of Birth", formatLongDate(selectedPatient.dateOfBirth)],
              ["National ID", selectedPatient.nationalId || "-"],
              ["Phone", selectedPatient.phoneNumber || "-"],
              ["Email", selectedPatient.email || "-"],
            ].map(([label, value]) => (
              <View key={label} style={[patientsUi.summaryItem, { borderColor: T.borderLight }]}>
                <Text style={[patientsUi.summaryLabel, { color: T.textMuted }]}>{label}</Text>
                <Text style={[patientsUi.summaryValue, { color: T.text }]}>{value}</Text>
              </View>
            ))}
          </View>
          <InlineActions>
            {onOpenMessaging ? (
              <ActionButton
                label="Message Patient"
                onPress={() => onOpenMessaging(selectedPatient.id, selectedPatient.fullName)}
                variant="secondary"
              />
            ) : null}
            {onOpenPatientAccess ? (
              <ActionButton
                label="Open Medical Record"
                onPress={() => setAccessModalVisible(true)}
                variant="ghost"
              />
            ) : null}
          </InlineActions>
        </Card>
      ) : null}

      {section === "register" ? (
        <Card title="Register Patient">
          <InputField label="Patient ID" value={form.mrn} onChangeText={(value) => onFormChange("mrn", value)} placeholder="MRN-0001" />
          <InputField label="National ID" value={form.nationalId} onChangeText={(value) => onFormChange("nationalId", value)} />
          <InputField label="Given Name" value={form.givenName} onChangeText={(value) => onFormChange("givenName", value)} />
          <InputField label="Middle Name" value={form.middleName} onChangeText={(value) => onFormChange("middleName", value)} />
          <InputField label="Family Name" value={form.familyName} onChangeText={(value) => onFormChange("familyName", value)} />
          <DateOfBirthField label="Date of Birth" value={form.dateOfBirth} onChangeText={(value) => onFormChange("dateOfBirth", value)} />
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
        </Card>
      ) : null}

      {section === "lookup" ? (
        <Card title="Lookup Patient">
          <InputField label="Patient ID" value={lookupMrn} onChangeText={setLookupMrn} />
          <DateOfBirthField label="Date of Birth" value={lookupDob} onChangeText={setLookupDob} />
          <InlineActions>
            <ActionButton label="Find by Patient ID + DOB" onPress={lookupByMrnAndDob} variant="secondary" />
            <ActionButton label="Find by Patient ID" onPress={lookupByMrn} variant="ghost" />
          </InlineActions>
        </Card>
      ) : null}

      {section === "appointments" ? (
        <Card title="Book Appointment">
          {!selectedPatient ? (
            <MessageBanner message="Select a patient first in Patient Lookup before booking an appointment." tone="info" />
          ) : null}
          <InputField
            label="Patient ID"
            value={selectedPatient?.mrn || ""}
            onChangeText={() => undefined}
            placeholder="From Patient Lookup"
          />
          <InputField
            label="Patient Name"
            value={selectedPatient?.fullName || ""}
            onChangeText={() => undefined}
            placeholder="From Patient Lookup"
          />
          {Platform.OS === "web" ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 13, color: T.text }}>Appointment Date & Time</Text>
              <input
                type="datetime-local"
                value={appointmentDateTime}
                onChange={(event) => setAppointmentDateTime(event.currentTarget.value)}
                style={{
                  minHeight: 44,
                  borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  padding: "10px 12px",
                  backgroundColor: T.inputBg,
                  color: T.text,
                }}
              />
            </View>
          ) : (
            <InputField
              label="Appointment Date & Time"
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
            label="Assigned Doctor/Nurse Employee ID (optional)"
            value={appointmentClinicianEmployeeId}
            onChangeText={setAppointmentClinicianEmployeeId}
            placeholder="PHY-1023"
          />
          <InlineActions>
            <ActionButton label="Book Appointment" onPress={bookAppointment} />
          </InlineActions>
        </Card>
      ) : null}

      {section === "updates" ? (
        <Card title="Patient Updates">
          {!selectedPatient ? (
            <MessageBanner message="Select a patient first in Patient Lookup before updating contact or consent." tone="info" />
          ) : null}
          <InputField
            label="Patient ID"
            value={selectedPatient?.mrn || ""}
            onChangeText={() => undefined}
            placeholder="From Patient Lookup"
          />
          <InputField
            label="Patient Name"
            value={selectedPatient?.fullName || ""}
            onChangeText={() => undefined}
            placeholder="From Patient Lookup"
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
      ) : null}

      {appointmentResult ? (
        <Card title="Latest Appointment">
          <View style={patientsUi.summaryGrid}>
            {[
              ["Appointment Number", appointmentResult.appointmentNumber || "-"],
              ["Patient Name", selectedPatient?.fullName || appointmentResult.patientName || "-"],
              ["Patient ID", selectedPatient?.mrn || "-"],
              ["Scheduled At", formatDateTime(appointmentResult.scheduledAt)],
              ["Assigned Clinician", appointmentResult.clinicianName || "-"],
              ["Status", appointmentResult.status || "-"],
            ].map(([label, value]) => (
              <View key={label} style={[patientsUi.summaryItem, { borderColor: T.borderLight }]}>
                <Text style={[patientsUi.summaryLabel, { color: T.textMuted }]}>{label}</Text>
                <Text style={[patientsUi.summaryValue, { color: T.text }]}>{value}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </>
  );
}

const patientsUi = StyleSheet.create({
  sectionTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sectionTab: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionTabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  field: {
    gap: 8,
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateField: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  dateTextInput: {
    flex: 1,
  },
  dateReadonlyText: {
    fontSize: 16,
  },
  calendarWrap: {
    width: 44,
    height: 44,
    position: "relative",
  },
  calendarBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 10,
  },
  calendarBtnText: {
    fontSize: 18,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  vulnerabilityWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  vulnerabilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  vulnerabilityBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  summaryItem: {
    minWidth: 200,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
  },
});
