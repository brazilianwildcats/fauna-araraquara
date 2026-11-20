
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const BASE_DIR =
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), "AppData", "Local");

const OUTPUT_DIR = path.join(
    BASE_DIR,
    "FaunaAraraquara",
    "inat-download"
);

const STATE_PATH = path.join(OUTPUT_DIR, "estado.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "relatorio.json");
const ERRORS_PATH = path.join(OUTPUT_DIR, "erros.json");

const USER_ID = 5649653;

function isGifUrl(url) {
    return typeof url === "string" &&
        /\.gif(?:$|[?#])/i.test(url);
}

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath, data) {
    const temporaryPath = `${filePath}.tmp`;

    await fs.writeFile(
        temporaryPath,
        JSON.stringify(data, null, 2),
        "utf8"
    );

    await fs.rename(temporaryPath, filePath);
}

function buildReport(state) {
    const observations = Object.values(state.observations);

    const photos = observations.flatMap((observation) =>
        Object.values(observation.photos || {})
    );

    const original = photos.filter(
        (photo) => photo.source === "original"
    ).length;

    const large = photos.filter(
        (photo) => photo.source === "large"
    ).length;

    const ignoredFormat = photos.filter(
        (photo) => photo.status === "ignored_format"
    ).length;

    const failed = photos.filter(
        (photo) => photo.status === "failed"
    ).length;

    return {
        generated_at: new Date().toISOString(),
        account: state.account,
        user_id: state.user_id,
        summary: {
            observations: observations.length,
            photos: photos.length,
            original,
            large,
            available: original + large,
            ignored_format: ignoredFormat,
            failed,
        },
        observations,
    };
}

async function main() {
    const state = await readJson(STATE_PATH);

    if (state.user_id !== USER_ID) {
        throw new Error("O arquivo de estado não pertence à conta esperada.");
    }

    let converted = 0;

    for (const observation of Object.values(state.observations)) {
        for (const photo of Object.values(observation.photos || {})) {
            if (
                photo.status === "failed" &&
                isGifUrl(photo.url)
            ) {
                photo.status = "ignored_format";
                photo.source = null;
                delete photo.error;
                photo.updated_at = new Date().toISOString();

                converted++;

                console.log(
                    `GIF ignorado: ${photo.id} — ${observation.species}`
                );
            }
        }
    }

    const report = buildReport(state);

    const errors = report.observations.flatMap((observation) =>
        Object.values(observation.photos || {})
            .filter((photo) => photo.status === "failed")
            .map((photo) => ({
                observation_id: observation.id,
                species: observation.species,
                photo_id: photo.id,
                error: photo.error,
            }))
    );

    await writeJsonAtomic(STATE_PATH, state);
    await writeJsonAtomic(REPORT_PATH, report);

    await writeJsonAtomic(ERRORS_PATH, {
        generated_at: new Date().toISOString(),
        total_errors: errors.length,
        errors,
    });

    console.log("\nCorreção concluída.");
    console.log(`GIFs classificados como ignorados: ${converted}`);
    console.log(`Fotos disponíveis: ${report.summary.available}`);
    console.log(`Falhas restantes: ${report.summary.failed}`);
    console.log(`Total de fotos: ${report.summary.photos}`);
}

main().catch((error) => {
    console.error("\nERRO:", error.message);
    process.exitCode = 1;
});
