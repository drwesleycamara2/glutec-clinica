/**
 * Assinatura digital de PDFs com certificado A1 PF (PFX/PKCS#12) — ICP-Brasil
 *
 * Usa node-forge para criar a assinatura PKCS#7 e @signpdf/signpdf para
 * embeddar no PDF conforme o padrão Adobe/ITI.
 */

import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { SignPdf, Signer } from "@signpdf/signpdf";

export interface A1SignResult {
  signedPdfBase64: string;
  commonName: string;
  cpf: string;
  validTo: string;
}

// ─── Implementação do Signer usando node-forge ────────────────────────────────
class P12Signer extends Signer {
  private pfxBuffer: Buffer;
  private password: string;

  constructor(pfxBuffer: Buffer, password: string) {
    super();
    this.pfxBuffer = pfxBuffer;
    this.password = password;
  }

  async sign(pdfBuffer: Buffer, _signingTime?: Date): Promise<Buffer> {
    // 1. Parsear PFX
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(this.pfxBuffer));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, this.password);

    // 2. Extrair chave privada
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0];
    if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX.");

    // 3. Extrair certificados
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certs = (certBags[forge.pki.oids.certBag] ?? [])
      .map((b) => b.cert!)
      .filter(Boolean);
    if (certs.length === 0) throw new Error("Certificado não encontrado no PFX.");

    // 4. Criar PKCS#7 SignedData
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer);

    // Adicionar todos os certificados da cadeia
    certs.forEach((c) => p7.addCertificate(c));

    // Adicionar assinante
    p7.addSigner({
      key: keyBag.key as forge.pki.rsa.PrivateKey,
      certificate: certs[0],
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        {
          type: forge.pki.oids.signingTime,
          value: _signingTime ?? new Date(),
        },
      ],
    });

    // 5. Assinar (detached = sem dados embutidos, só a assinatura)
    p7.sign({ detached: true });

    // 6. Serializar para DER
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return Buffer.from(der, "binary");
  }
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Valida o PFX e retorna informações do certificado (sem salvar nada)
 */
export function inspectPfx(pfxBase64: string, password: string) {
  const pfxBuf = Buffer.from(pfxBase64, "base64");
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuf));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bags = certBags[forge.pki.oids.certBag];
  if (!bags?.length) throw new Error("Nenhum certificado encontrado no arquivo PFX.");

  const cert = bags[0]?.cert;
  if (!cert) throw new Error("Certificado inválido no arquivo PFX.");

  const getAttr = (subject: forge.pki.Certificate["subject"], name: string) =>
    subject.getField(name)?.value || "";

  const cn = getAttr(cert.subject, "CN");
  const cpfMatch = cn.match(/(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})/);

  return {
    commonName: cn,
    cpf: cpfMatch?.[1] ?? "",
    validFrom: cert.validity.notBefore,
    validTo: cert.validity.notAfter,
    issuer: getAttr(cert.issuer, "CN"),
  };
}

/**
 * Assina um PDF com o certificado A1 PF e retorna o PDF assinado em base64
 */
export async function signPdfWithA1(
  pdfInput: string | Buffer,
  pfxBase64: string,
  password: string,
  signerName?: string,
): Promise<A1SignResult> {
  // 1. Buffer do PDF de entrada
  const pdfBuf = typeof pdfInput === "string" ? Buffer.from(pdfInput, "base64") : pdfInput;

  // 2. Carregar e adicionar placeholder de assinatura
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const pdfWithPlaceholder = await pdflibAddPlaceholder({
    pdfDoc,
    reason: "Assinatura digital do responsável médico",
    contactInfo: signerName ?? "Clínica Glutée",
    name: signerName ?? "Médico Responsável",
    location: "Mogi Guaçu, SP",
    signatureLength: 8192,
  });

  // 3. Criar signer e assinar
  const pfxBuf = Buffer.from(pfxBase64, "base64");
  const signer = new P12Signer(pfxBuf, password);
  const signPdf = new SignPdf();
  const signedPdf = await signPdf.sign(Buffer.from(pdfWithPlaceholder), signer);

  // 4. Montar retorno com info do cert
  const info = inspectPfx(pfxBase64, password);

  return {
    signedPdfBase64: signedPdf.toString("base64"),
    commonName: info.commonName,
    cpf: info.cpf,
    validTo: info.validTo.toISOString(),
  };
}
