
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const USER_LOGIN = "polones";
const OBSERVATION_ID = process.argv[2] || "414882709";

async function downloadImage(url, destination) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
        throw new Error(`Resposta não é uma imagem: ${contentType}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
        throw new Error("Arquivo recebido está vazio.");
    }

    await fs.writeFile(destination, buffer);

    return {
        size: buffer.length,
        contentType,
    };
}

async function main() {
    console.log(`Consultando observação ${OBSERVATION_ID}...`);

    const response = await fetch(
        `https://api.inaturalist.org/v1/observations/${OBSERVATION_ID}`
    );

    if (!response.ok) {
        throw new Error(`Erro ao consultar observação: HTTP ${response.status}`);
    }

    const data = await response.json();
const observation = data.results?.[0];

if (!observation) {
    throw new Error("Observação não encontrada na resposta da API.");
}

    if (observation.user?.login !== USER_LOGIN) {
        throw new Error("A observação não pertence à conta polones.");
    }

    if (!observation.photos?.length) {
        throw new Error("A observação não possui fotografias.");
    }

    const photo = observation.photos[0];
    const originalUrl = photo.url.replace("/square.", "/original.");
    const largeUrl = photo.url.replace("/square.", "/large.");

    const outputDirectory = path.join(
        os.tmpdir(),
        "inat-download-test",
        String(observation.id)
    );

    await fs.mkdir(outputDirectory, { recursive: true });

    const destination = path.join(outputDirectory, "foto-original.jpg");

    console.log(`Espécie: ${observation.taxon?.name ?? "Não identificada"}`);
    console.log(`Fotografias disponíveis: ${observation.photos.length}`);
    console.log("Tentando baixar a imagem original...");

    let result;

    try {
        result = await downloadImage(originalUrl, destination);
        console.log("Download original concluído.");
    } catch (error) {
        console.log(`Original indisponível: ${error.message}`);
        console.log("Tentando a versão large...");

        result = await downloadImage(largeUrl, destination);
        console.log("Download da versão large concluído.");
    }

    console.log(`Tipo: ${result.contentType}`);
    console.log(`Tamanho: ${(result.size / 1024).toFixed(2)} KB`);
    console.log(`Arquivo: ${destination}`);

    console.log("\nTeste concluído com sucesso.");

    // Abre a imagem no visualizador padrão do Windows.
    const { execFile } = await import("node:child_process");

    if (process.platform === "win32") {
        execFile("cmd", ["/c", "start", "", destination]);
    }
}

main().catch((error) => {
    console.error("\nFalha no teste:", error.message);
    process.exitCode = 1;
});
