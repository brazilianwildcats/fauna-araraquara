
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const USER_ID = 5649653;
const USER_LOGIN = "polones";

const PER_PAGE = 200;
const API_DELAY_MS = 1100;
const PHOTO_DELAY_MS = 100;
const MAX_ATTEMPTS = 4;

const BASE_DIR =
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), "AppData", "Local");

const OUTPUT_DIR = path.join(
    BASE_DIR,
    "FaunaAraraquara",
    "inat-download"
);

const OBSERVATIONS_DIR = path.join(OUTPUT_DIR, "observacoes");
const STATE_PATH = path.join(OUTPUT_DIR, "estado.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "relatorio.json");
const ERRORS_PATH = path.join(OUTPUT_DIR, "erros.json");

const API_URL = "https://api.inaturalist.org/v1/observations";

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

function slugify(value) {
    return String(value || "especie-nao-identificada")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function getImageExtension(contentType, buffer) {
    if (
        contentType.includes("jpeg") &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8
    ) {
        return ".jpg";
    }

    if (
        contentType.includes("png") &&
        buffer.subarray(0, 8).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        )
    ) {
        return ".png";
    }

    if (
        contentType.includes("webp") &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return ".webp";
    }

    throw new Error("Conteudo recebido nao e uma imagem reconhecida.");
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

async function loadState() {
    try {
        const content = await fs.readFile(STATE_PATH, "utf8");
        const state = JSON.parse(content);

        if (
            state.account !== USER_LOGIN ||
            state.user_id !== USER_ID ||
            !state.observations
        ) {
            throw new Error("O arquivo de estado pertence a outra conta ou tem formato invalido.");
        }

        console.log("Estado anterior encontrado. Retomando o processamento.");

        return state;
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        console.log("Nenhum estado anterior encontrado. Iniciando novo processamento.");

        return {
            version: 1,
            account: USER_LOGIN,
            user_id: USER_ID,
            created_at: new Date().toISOString(),
            updated_at: null,
            scan: {},
            observations: {},
        };
    }
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

    const failed = photos.filter(
        (photo) => photo.status === "failed"
    ).length;

    return {
        generated_at: new Date().toISOString(),
        account: USER_LOGIN,
        user_id: USER_ID,

        summary: {
            observations: observations.length,
            photos: photos.length,
            original,
            large,
            available: photos.length - failed,
            failed,
        },

        observations,
    };
}

async function saveProgress(state) {
    state.updated_at = new Date().toISOString();

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
}

async function fetchWithRetry(url, description) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url);

            if (response.ok) {
                return response;
            }

            const retryable =
                response.status === 429 ||
                response.status >= 500;

            if (!retryable || attempt === MAX_ATTEMPTS) {
                throw new Error(`HTTP ${response.status}`);
            }

            const retryAfter = Number(
                response.headers.get("retry-after")
            );

            const waitTime = retryAfter > 0
                ? retryAfter * 1000
                : attempt * 2000;

            console.log(
                `  ${description}: HTTP ${response.status}. Nova tentativa em ${Math.ceil(waitTime / 1000)}s.`
            );

            await sleep(waitTime);
        } catch (error) {
            lastError = error;

            if (
                error.message.startsWith("HTTP ") ||
                attempt === MAX_ATTEMPTS
            ) {
                break;
            }

            const waitTime = attempt * 2000;

            console.log(
                `  ${description}: ${error.message}. Tentativa ${attempt + 1}/${MAX_ATTEMPTS}.`
            );

            await sleep(waitTime);
        }
    }

    throw lastError || new Error(`${description}: falha desconhecida.`);
}

async function getObservationPage(page) {
    const params = new URLSearchParams({
        user_id: String(USER_ID),
        order_by: "created_at",
        order: "desc",
        per_page: String(PER_PAGE),
        page: String(page),
        photos: "true",
    });

    const response = await fetchWithRetry(
        `${API_URL}?${params}`,
        `Pagina ${page}`
    );

    return response.json();
}

async function findExistingImage(directory, photoId) {
    let files;

    try {
        files = await fs.readdir(directory);
    } catch {
        return null;
    }

    const prefix = `foto-${photoId}.`;

    for (const file of files) {
        if (!file.startsWith(prefix) || file.endsWith(".part")) {
            continue;
        }

        const filePath = path.join(directory, file);

        try {
            const buffer = await fs.readFile(filePath);

            if (buffer.length < 100) {
                await fs.rm(filePath, { force: true });
                continue;
            }

            const extension = path.extname(file).toLowerCase();

            const contentType = {
                ".jpg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
            }[extension];

            if (!contentType) {
                continue;
            }

            getImageExtension(contentType, buffer);

            return {
                file: filePath,
                size: buffer.length,
            };
        } catch {
            await fs.rm(filePath, { force: true });
        }
    }

    return null;
}

async function downloadImage(url, destinationBase) {
    const response = await fetchWithRetry(url, "Download da imagem");

    const contentType = (
        response.headers.get("content-type") || ""
    ).toLowerCase();

    if (!contentType.startsWith("image/")) {
        throw new Error(`Tipo de conteudo invalido: ${contentType}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length < 100) {
        throw new Error("Arquivo muito pequeno ou vazio.");
    }

    const extension = getImageExtension(contentType, buffer);

    const destination = destinationBase + extension;
    const temporaryPath = `${destination}.part`;

    try {
        await fs.writeFile(temporaryPath, buffer);
        await fs.rename(temporaryPath, destination);
    } catch (error) {
        await fs.rm(temporaryPath, { force: true });
        throw error;
    }

    return {
        file: destination,
        size: buffer.length,
    };
}

async function downloadPhoto(photo, directory, previousRecord) {
    const existing = await findExistingImage(directory, photo.id);

    if (existing) {
        return {
            status: "already_exists",
            source: previousRecord?.source || "existing_untracked",
            file: existing.file,
            size: existing.size,
        };
    }

    const destinationBase = path.join(
        directory,
        `foto-${photo.id}`
    );

    const originalUrl = photo.url.replace("/square.", "/original.");
    const largeUrl = photo.url.replace("/square.", "/large.");

    let originalError;

    try {
        const result = await downloadImage(
            originalUrl,
            destinationBase
        );

        return {
            status: "downloaded",
            source: "original",
            ...result,
        };
    } catch (error) {
        originalError = error;
        console.log(`    Original indisponivel: ${error.message}`);
    }

    try {
        if (largeUrl === originalUrl) {
            throw new Error("URL alternativa indisponivel.");
        }

        const result = await downloadImage(
            largeUrl,
            destinationBase
        );

        return {
            status: "downloaded",
            source: "large",
            ...result,
        };
    } catch (error) {
        return {
            status: "failed",
            source: null,
            error: `Original: ${originalError.message}; Large: ${error.message}`,
        };
    }
}

async function processObservation(observation, state, counters) {
    const species =
        observation.taxon?.name || "especie-nao-identificada";

    const folderName =
        `${observation.id}_${slugify(species)}`;

    const directory = path.join(
        OBSERVATIONS_DIR,
        folderName
    );

    await fs.mkdir(directory, { recursive: true });

    const observationId = String(observation.id);

    const previousObservation =
        state.observations[observationId] || {};

    const observationState = {
        id: observation.id,
        species,
        common_name: observation.taxon?.preferred_common_name || null,
        observed_on: observation.observed_on || null,
        created_at: observation.created_at || null,
        observation_url: observation.uri || null,
        photos: previousObservation.photos || {},
    };

    console.log("----------------------------------------");
    console.log(`${species} (ID ${observation.id})`);
    console.log(`Fotografias: ${observation.photos.length}`);

    for (const photo of observation.photos) {
        const photoId = String(photo.id);

        const previousRecord =
            observationState.photos[photoId];

        const result = await downloadPhoto(
            photo,
            directory,
            previousRecord
        );

        observationState.photos[photoId] = {
            id: photo.id,
            url: photo.url,
            ...result,
            updated_at: new Date().toISOString(),
        };

        counters.processed++;

        if (result.status === "failed") {
            counters.failed++;
            console.log(`  FALHA foto ${photo.id}: ${result.error}`);
        } else {
            counters.available++;

            if (result.source === "original") {
                counters.original++;
            } else if (result.source === "large") {
                counters.large++;
            }

            if (result.status === "downloaded") {
                console.log(
                    `  Baixada (${result.source}): foto ${photo.id}`
                );
            }
        }

        if (counters.processed % 25 === 0) {
            console.log(
                `  Progresso: ${counters.processed} fotografias processadas.`
            );
        }

        await sleep(PHOTO_DELAY_MS);
    }

    state.observations[observationId] = observationState;
}

async function main() {
    await fs.mkdir(OBSERVATIONS_DIR, { recursive: true });

    const state = await loadState();

    state.scan = {
        started_at: new Date().toISOString(),
        total_results: null,
        pages_completed: 0,
        observations_seen: 0,
    };

    const counters = {
        processed: 0,
        available: 0,
        failed: 0,
        original: 0,
        large: 0,
    };

    const seenIds = new Set();

    console.log("\n========================================");
    console.log("DOWNLOAD COMPLETO - iNaturalist");
    console.log("========================================");
    console.log(`Conta: ${USER_LOGIN}`);
    console.log(`Destino: ${OUTPUT_DIR}\n`);

    let page = 1;
    let totalResults = null;
    let finished = false;

    while (!finished) {
        console.log(`\nConsultando pagina ${page}...`);

        const data = await getObservationPage(page);

        if (totalResults === null) {
            totalResults = data.total_results;

            if (totalResults > 10000) {
                throw new Error(
                    "Mais de 10.000 resultados. E necessario dividir a consulta em intervalos antes de continuar."
                );
            }

            state.scan.total_results = totalResults;

            console.log(`Total de observacoes informado: ${totalResults}`);
        }

        const observations = data.results || [];

        if (observations.length === 0) {
            break;
        }

        for (const observation of observations) {
            const observationId = String(observation.id);

            if (seenIds.has(observationId)) {
                continue;
            }

            seenIds.add(observationId);

            if (observation.user?.login !== USER_LOGIN) {
                throw new Error(
                    `A observacao ${observation.id} nao pertence a conta ${USER_LOGIN}.`
                );
            }

            await processObservation(
                observation,
                state,
                counters
            );

            state.scan.observations_seen++;

            await saveProgress(state);
        }

        state.scan.pages_completed = page;
        await saveProgress(state);

        console.log(
            `Pagina ${page} concluida. Observacoes verificadas: ${state.scan.observations_seen}/${totalResults}`
        );

        if (
            state.scan.observations_seen >= totalResults ||
            observations.length < PER_PAGE
        ) {
            finished = true;
        } else {
            page++;
            await sleep(API_DELAY_MS);
        }
    }

    state.scan.completed_at = new Date().toISOString();

    await saveProgress(state);

    const report = buildReport(state);

    console.log("\n========================================");
    console.log("PROCESSAMENTO CONCLUIDO");
    console.log("========================================");
    console.log(`Observacoes no relatorio: ${report.summary.observations}`);
    console.log(`Fotografias no relatorio: ${report.summary.photos}`);
    console.log(`Originais: ${report.summary.original}`);
    console.log(`Versoes large: ${report.summary.large}`);
    console.log(`Disponiveis: ${report.summary.available}`);
    console.log(`Falhas no historico: ${report.summary.failed}`);

    console.log("\nArquivos:");
    console.log(`Estado: ${STATE_PATH}`);
    console.log(`Relatorio: ${REPORT_PATH}`);
    console.log(`Erros: ${ERRORS_PATH}`);
    console.log(`Fotografias: ${OBSERVATIONS_DIR}`);
}

main().catch((error) => {
    console.error("\nERRO NO PROCESSAMENTO:", error.message);
    console.error("O progresso ja salvo sera preservado.");
    process.exitCode = 1;
});
