import { Fragment, ReactNode, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { APP_VERSION, isReleaseVersion } from '../constants/release';
import { RELEASE_NOTES, ReleaseNote } from '../constants/releaseNotes.generated';
import { BASE_DOMAIN, currentHostname, currentReleaseChannel } from '../lib/tenant';

// HT-41: what changed in the version this host is running.
//
//   https://prod.handytally.com/whats-new         the next release customers get
//   https://wgelectricus.handytally.com/whats-new what this customer has
//
// Public on purpose: it sits outside the (app) group, so the session check in
// app/(app)/_layout.tsx does not apply; the customer is emailed this link
// before their site is promoted (Docs/release-process.md). The notes come from
// RELEASE_NOTES.md through scripts/release-notes.mjs, so the page can only
// show what the release PR wrote.
//
// A demo or local build has no release of its own; it shows the newest
// section as "coming in vX.Y.Z" because that is what it is running ahead of.

export default function WhatsNewScreen() {
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => {
    setHost(currentHostname());
  }, []);

  const release = isReleaseVersion();
  const current = release ? RELEASE_NOTES.find(note => note.version === APP_VERSION) ?? null : null;
  const featured: ReleaseNote | null = current ?? RELEASE_NOTES[0] ?? null;
  const earlier = RELEASE_NOTES.filter(note => note !== featured);

  let heading: string;
  let context: string;
  if (current) {
    heading = `What's new in ${current.version}`;
    context = `${host ?? 'This site'} runs ${current.version}${current.date ? `, released ${current.date}` : ''}.`;
  } else if (featured) {
    heading = `Coming in ${featured.version}`;
    context = release
      ? `${host ?? 'This site'} runs ${APP_VERSION}, which has no notes of its own yet; these are the newest.`
      : currentReleaseChannel === 'demo'
        ? `${host ?? 'The demo'} runs the latest development build (${APP_VERSION}), ahead of the next release.`
        : `This is a development build (${APP_VERSION}); these are the notes for the next release.`;
  } else {
    heading = "What's new";
    context = 'No release notes have been written yet.';
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.kicker}>HandyTally</Text>
        <Text style={styles.title}>{heading}</Text>
        <Text style={styles.context}>{context}</Text>

        {featured ? <MarkdownBody body={featured.body} /> : null}
      </View>

      {earlier.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Earlier releases</Text>
          {earlier.map(note => (
            <View key={note.version} style={styles.earlier}>
              <Text style={styles.earlierTitle}>
                {note.version}
                {note.date ? <Text style={styles.earlierDate}>{`  ${note.date}`}</Text> : null}
              </Text>
              <MarkdownBody body={note.body} />
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity onPress={() => Linking.openURL(`https://${host ?? `prod.${BASE_DOMAIN}`}/`)}>
        <Text style={styles.footer}>Back to HandyTally</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// The subset of Markdown the release notes use: `###` headings, `-` bullets,
// paragraphs, and **bold** / `code` inline. Enough for notes a person writes
// by hand, and no dependency for a page that is mostly text.
type Block = { kind: 'heading'; text: string } | { kind: 'bullet'; text: string } | { kind: 'paragraph'; text: string };

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', text: heading[1].trim() });
    } else if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', text: bullet[1].trim() });
    } else if (line.trim() === '') {
      flush();
    } else if (blocks.length && blocks[blocks.length - 1].kind === 'bullet' && /^\s{2,}/.test(raw) && paragraph.length === 0) {
      // A wrapped bullet: the Markdown source indents its continuation lines.
      const last = blocks[blocks.length - 1] as Extract<Block, { kind: 'bullet' }>;
      last.text = `${last.text} ${line.trim()}`;
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

function Inline({ text }: { text: string }): ReactNode {
  // Split on **bold** and `code` spans; odd segments are the marked ones.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <Fragment>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={index} style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={index} style={styles.code}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </Fragment>
  );
}

function MarkdownBody({ body }: { body: string }) {
  const blocks = parseBlocks(body);
  return (
    <View>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <Text key={index} style={styles.heading}>
              {block.text}
            </Text>
          );
        }
        if (block.kind === 'bullet') {
          return (
            <View key={index} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.body}>
                <Inline text={block.text} />
              </Text>
            </View>
          );
        }
        return (
          <Text key={index} style={[styles.body, styles.paragraph]}>
            <Inline text={block.text} />
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    alignItems: 'center',
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: 'white',
    padding: 28,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: '#1b365d',
    marginTop: 6,
  },
  context: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
    marginTop: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1b365d',
    marginBottom: 8,
  },
  earlier: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    marginTop: 12,
  },
  earlierTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  earlierDate: {
    fontSize: 13,
    fontWeight: '400',
    color: '#9ca3af',
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    flex: 1,
  },
  paragraph: {
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingRight: 8,
  },
  bulletDot: {
    width: 18,
    fontSize: 15,
    lineHeight: 22,
    color: '#6b7280',
  },
  bold: {
    fontWeight: '600',
    color: '#1f2937',
  },
  code: {
    fontFamily: 'monospace',
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
  },
  footer: {
    marginTop: 8,
    fontSize: 13,
    color: '#4169E1',
  },
});
