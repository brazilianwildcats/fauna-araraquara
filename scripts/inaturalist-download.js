
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const USER_ID = 5649653;
const USER_LOGIN = "polones";
const PER_PAGE = 20;

const OUTPUT_DIR = path.join(os.tmpdir(), "inat-download");

function slugify(value) {
    return String(value || "especie-nao-identificada")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function getImageExtension(contentType, buffer) {
    if (contentType.includes("jpeg") &&
        buffer[0] === 0xff && buffer[1] === 0xd8) {
        return ".jpg";
    }

    if (contentType.includes("png") &&
        buffer.subarray(0, 8).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        )) {
        return ".png";
    }

    if (contentType.includes("webp") &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP") {
        return ".webp";
    }

    throw new Error("O conteúdo recebido não é uma imagem reconhecida.");
}

async function downloadImage(url, destinationBase) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
        throw new Error(`Tipo de conteúdo inválido: ${contentType}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length < 100) {
        throw new Error("Arquivo muito pequeno ou vazio.");
    }

    const extension = getImageExtension(contentType, buffer);
    const destination = destinationBase + extension;

    await fs.writeFile(destination, buffer);

    return {
        destination,
        size: buffer.length,
        extension,
    };
}

async function downloadPhoto(photo, directory, index) {
    const baseName = `foto-${String(index + 1).padStart(2, "0")}`;
    const destinationBase = path.join(directory, baseName);

    // Não baixa novamente uma imagem que já existe e é válida.
    for (const extension of [".jpg", ".png", ".webp"]) {
        const existingPath = destinationBase + extension;

        try {
            const buffer = await fs.readFile(existingPath);
            getImageExtension(
                extension === ".jpg"
                    ? "image/jpeg"
                    : extension === ".png"
                        ? "image/png"
                        : "image/webp",
                buffer
            );

            if (buffer.length >= 100) {
                return {
                    status: "already_exists",
                    file: existingPath,
                    size: buffer.length,
                };
            }
        } catch {
            // Arquivo ausente ou inválido: tenta baixar novamente.
        }
    }

    const originalUrl = photo.url.replace("/square.", "/original.");
    const largeUrl = photo.url.replace("/square.", "/large.");

    try {
        const result = await downloadImage(originalUrl, destinationBase);

        return {
            status: "downloaded_original",
            file: result.destination,
            size: result.size,
        };
    } catch (originalError) {
        console.log(`    Original indisponível: ${originalError.message}`);

        try {
            const result = await downloadImage(largeUrl, destinationBase);

            return {
                status: "downloaded_large",
                file: result.destination,
                size: result.size,
            };
        } catch (largeError) {
            return {
                status: "failed",
                error: largeError.message,
            };
        }
    }
}

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const params = new URLSearchParams({
        user_id: String(USER_ID),
        order_by: "created_at",
        order: "desc",
        per_page: String(PER_PAGE),
        photos: "true",
    });

    const url = `https://api.inaturalist.org/v1/observations?${params}`;

    console.log("Consultando observações no iNaturalist...\n");

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Erro na API: HTTP ${response.status}`);
    }

    const data = await response.json();

    const observations = data.results.filter(
        (observation) => observation.user?.login === USER_LOGIN
    );

    console.log(`Observações próprias encontradas: ${observations.length}`);
    console.log(`Pasta de destino: ${OUTPUT_DIR}\n`);

    const report = {
        generated_at: new Date().toISOString(),
        account: USER_LOGIN,
        observations: [],
    };

    for (const observation of observations) {
        const species = observation.taxon?.name || "especie-nao-identificada";
        const folderName = `${observation.id}_${slugify(species)}`;
        const directory = path.join(OUTPUT_DIR, folderName);

        await fs.mkdir(directory, { recursive: true });

        console.log("----------------------------------------");
        console.log(`${species} (ID ${observation.id})`);
        console.log(`Fotografias: ${observation.photos.length}`);

        const observationReport = {
            id: observation.id,
            species,
            observed_on: observation.observed_on,
            created_at: observation.created_at,
            observation_url: observation.uri,
            photos: [],
        };

        for (const [index, photo] of observation.photos.entries()) {
            console.log(`  Baixando foto ${index + 1}...`);

            const result = await downloadPhoto(photo, directory, index);

            console.log(
                `    ${result.status}: ${
                    result.file || result.error
                }`
            );

            observationReport.photos.push({
                photo_id: photo.id,
                ...result,
            });
        }

        report.observations.push(observationReport);
    }

    const reportPath = path.join(OUTPUT_DIR, "relatorio.json");

    await fs.writeFile(
        reportPath,
        JSON.stringify(report, null, 2),
        "utf8"
    );

    const allPhotos = report.observations.flatMap(
        (observation) => observation.photos
    );

    const successful = allPhotos.filter(
        (photo) => photo.status !== "failed"
    ).length;

    const failed = allPhotos.filter(
        (photo) => photo.status === "failed"
    ).length;

    console.log("\n========================================");
    console.log("DOWNLOAD CONCLUÍDO");
    console.log(`Observações: ${observations.length}`);
    console.log(`Fotografias processadas: ${allPhotos.length}`);
    console.log(`Fotografias disponíveis: ${successful}`);
    console.log(`Falhas: ${failed}`);
    console.log(`Relatório: ${reportPath}`);
    console.log(`Pasta: ${OUTPUT_DIR}`);
}

main().catch((error) => {
    console.error("\nFalha no processo:", error.message);
    process.exitCode = 1;
});
