import Link from "next/link";
import { APP_VERSION, APP_RELEASE_URL, APP_REPO_URL } from "@/lib/version";

export default function Footer() {
    return (
        <footer className="lfoot" role="contentinfo">
            <div className="lfoot-brand">
                <span className="lfoot-title">Plataforma MCDA</span>
                <a
                    href={APP_RELEASE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lfoot-ver-badge"
                    title={`Versión ${APP_VERSION} · Ver notas de la versión en GitHub`}
                >
                    v{APP_VERSION}
                </a>
                <span className="lfoot-sep" aria-hidden="true">
                    ·
                </span>
                <span className="lfoot-sub">
                    Toma de Decisiones Multicriterio
                </span>
            </div>

            <nav aria-label="Enlaces del pie de página" className="lfoot-nav">
                <Link href="/metodo">¿Qué método uso?</Link>
                <Link href="/tutorial">Cómo funciona</Link>
                <a
                    href={APP_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    GitHub
                </a>
                <a
                    href={APP_RELEASE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Notas de versión
                </a>
            </nav>
        </footer>
    );
}
