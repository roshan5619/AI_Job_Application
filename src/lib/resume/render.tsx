import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import { CandidateProfile } from "../types";

/**
 * Render a (tailored) CandidateProfile to a clean one-column PDF resume.
 * Used server-side inside the tailor workflow; returns a Buffer to upload.
 */
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  contact: { fontSize: 9, color: "#555", marginTop: 2, marginBottom: 10 },
  summary: { marginBottom: 12, lineHeight: 1.4 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
    borderBottom: "1 solid #ddd",
    paddingBottom: 2,
  },
  jobHeader: { flexDirection: "row", justifyContent: "space-between" },
  jobTitle: { fontFamily: "Helvetica-Bold" },
  jobDates: { color: "#555" },
  bullet: { marginLeft: 10, marginTop: 2, lineHeight: 1.3 },
  skills: { lineHeight: 1.4 },
  edu: { marginTop: 2 },
});

function ResumeDoc({ profile }: { profile: CandidateProfile }) {
  const contact = [profile.email, profile.phone, profile.location, ...profile.links]
    .filter(Boolean)
    .join("  •  ");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{profile.fullName}</Text>
        {contact ? <Text style={styles.contact}>{contact}</Text> : null}

        {profile.summary ? (
          <Text style={styles.summary}>{profile.summary}</Text>
        ) : null}

        {profile.skills.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Skills</Text>
            <Text style={styles.skills}>{profile.skills.join(" · ")}</Text>
          </View>
        ) : null}

        {profile.experience.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Experience</Text>
            {profile.experience.map((job, i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <View style={styles.jobHeader}>
                  <Text style={styles.jobTitle}>
                    {job.title} — {job.company}
                  </Text>
                  <Text style={styles.jobDates}>
                    {job.startDate} – {job.endDate}
                  </Text>
                </View>
                {job.highlights.map((h, j) => (
                  <Text key={j} style={styles.bullet}>
                    • {h}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {profile.education.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Education</Text>
            {profile.education.map((e, i) => (
              <Text key={i} style={styles.edu}>
                {e.degree}
                {e.field ? `, ${e.field}` : ""} — {e.institution}
                {e.year ? ` (${e.year})` : ""}
              </Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderResumePdf(
  profile: CandidateProfile,
): Promise<Buffer> {
  return renderToBuffer(<ResumeDoc profile={profile} />);
}
