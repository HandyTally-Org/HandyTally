// The one way a picked file becomes the base64 body the app stores in a text
// column (company_attachments.file_data for the logo and, since HT-47, for
// company documents). There is no Storage bucket: the browser reads the
// picked blob / data / file URI and the base64 goes straight into the row.

/** Reads the file behind a picker URI and returns its base64 body, without the `data:...;base64,` prefix. */
export async function fileToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      resolve(base64String.includes(',') ? base64String.split(',')[1] : base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
