"""Sampling of the Dirichlet PDFs of opinions, evaluated by SUBJ's DirichletPDF."""

from __future__ import annotations

import math
from typing import List, Optional, Tuple

import pysubj as sj

from .models import Pdf

# Below this uncertainty an opinion is treated as dogmatic (Dirac delta PDF)
DOGMATIC_UNCERTAINTY = 1e-9

DEFAULT_RESOLUTION = {2: 200, 3: 36}
DEFAULT_MARGINAL_RESOLUTION = 120


def _finite(value: float) -> Optional[float]:
    return value if math.isfinite(value) else None


def interior_grid(resolution: int) -> List[float]:
    """Cell midpoints of [0, 1], avoiding the boundary where densities may be infinite."""
    return [(i + 0.5) / resolution for i in range(resolution)]


def dirichlet_cells(resolution: int) -> List[Tuple[int, int, int, List[float]]]:
    """Triangulates the probability simplex of three states into resolution^2 cells.

    Returns (i, j, down, centroid) per cell. With n = resolution and k = n - 1 - i - j (up)
    or k = n - 2 - i - j (down), the barycentric corners (p1, p2, p3) of a cell are
      up:   (i, j, k + 1) / n, (i + 1, j, k) / n, (i, j + 1, k) / n
      down: (i + 1, j + 1, k) / n, (i, j + 1, k + 1) / n, (i + 1, j, k + 1) / n
    """
    n = resolution
    cells = []
    for i in range(n):
        for j in range(n - i):
            k = n - 1 - i - j
            cells.append((i, j, 0, [(i + 1 / 3) / n, (j + 1 / 3) / n, (k + 1 / 3) / n]))
            if k > 0:
                k -= 1
                cells.append((i, j, 1, [(i + 2 / 3) / n, (j + 2 / 3) / n, (k + 2 / 3) / n]))
    return cells


def _marginal_pdf(opinion: sj.MultinomialOpinion, state: int) -> sj.DirichletPDF:
    """Beta PDF of p(x_state), i.e. Beta(alpha_i, alpha_0 - alpha_i) of the opinion's Dirichlet PDF."""
    full = opinion.dir()
    evidence = full.evidence()
    base_rate = full.baseRate()
    marginal = sj.DirichletPDF()
    marginal.updateEvidence([evidence[state], sum(evidence) - evidence[state]])
    marginal.updateBaseRate([base_rate[state], 1.0 - base_rate[state]])
    marginal.updatePriorWeight(full.priorWeight())
    return marginal


def opinion_pdf(opinion: sj.MultinomialOpinion, resolution: Optional[int] = None) -> Pdf:
    dim = opinion.dim()

    if opinion.u() < DOGMATIC_UNCERTAINTY:
        return Pdf(kind="dogmatic", point=list(opinion.p()))

    dirichlet = opinion.dir()

    if dim == 2:
        xs = interior_grid(resolution or DEFAULT_RESOLUTION[2])
        return Pdf(kind="beta", x=xs, density=[_finite(dirichlet.density([x, 1.0 - x])) for x in xs])

    if dim == 3:
        n = resolution or DEFAULT_RESOLUTION[3]
        cells = [
            (i, j, down, _finite(dirichlet.density(centroid)))
            for i, j, down, centroid in dirichlet_cells(n)
        ]
        return Pdf(kind="dirichlet3", resolution=n, cells=cells)

    xs = interior_grid(resolution or DEFAULT_MARGINAL_RESOLUTION)
    marginals = []
    for state in range(dim):
        marginal = _marginal_pdf(opinion, state)
        marginals.append([_finite(marginal.density([x, 1.0 - x])) for x in xs])
    return Pdf(kind="marginals", x=xs, marginals=marginals)
