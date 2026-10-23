import React from "react";
import loaderGif from "../../loader/logo_loader.gif";

export default function Spinner(props) {
    return (
        <div className="loader" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--canvas-bg, #f4f7fa)", ...props }}>
            <img
                src={loaderGif}
                alt="Loading..."
                style={{ width: "240px", height: "240px", objectFit: "contain" }}
            />
        </div>
    );
}