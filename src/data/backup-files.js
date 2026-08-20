function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveBackupFile(data, filename = 'moin-routine-backup.json') {
  const json = typeof data === 'string'
    ? data
    : JSON.stringify(data, null, 2);

  const blob = new Blob([json], {
    type: 'application/json;charset=utf-8',
  });

  downloadBlob(blob, filename);
  return true;
}

export async function pickBackupFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');

    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.addEventListener(
      'change',
      async () => {
        try {
          const file = input.files?.[0];

          if (!file) {
            resolve(null);
            return;
          }

          resolve(await file.text());
        } catch (error) {
          reject(error);
        } finally {
          input.remove();
        }
      },
      { once: true },
    );

    document.body.appendChild(input);
    input.click();
  });
}
