use crate::features::export::PdfPageSize;

fn page(width_mm: f64, height_mm: f64) -> PdfPageSize {
    PdfPageSize { width_mm, height_mm }
}

#[test]
fn accepts_every_supported_paper_in_both_orientations() {
    for (w, h) in [(297.0, 420.0), (148.0, 210.0), (279.4, 431.8)] {
        assert!(page(w, h).validated().is_ok());
        assert!(page(h, w).validated().is_ok());
    }
}

#[test]
fn rejects_sizes_outside_the_bounds() {
    assert!(page(0.0, 297.0).validated().is_err());
    assert!(page(210.0, 5000.0).validated().is_err());
    assert!(page(f64::NAN, 297.0).validated().is_err());
}
