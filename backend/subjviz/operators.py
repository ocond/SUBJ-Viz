"""Thin wrappers that evaluate the API requests with pySUBJ.

All subjective logic computations are done by SUBJ. This module only converts between the API
models and pySUBJ objects and composes operator calls (e.g. the sub-simplex of a deduction is
obtained by deducing from the vacuous and the dogmatic antecedent opinions).
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence

import pysubj as sj

from . import models as m
from .pdf import opinion_pdf

# Masses below -VALIDITY_TOLERANCE or above 1 + VALIDITY_TOLERANCE make an opinion invalid
VALIDITY_TOLERANCE = 1e-9


def to_subj(opinion: m.OpinionIn) -> sj.MultinomialOpinion:
    return sj.MultinomialOpinion(list(opinion.belief), opinion.uncertainty, list(opinion.base_rate))


def is_finite(opinion: sj.MultinomialOpinion) -> bool:
    values = list(opinion.b()) + [opinion.u()] + list(opinion.a())
    return all(math.isfinite(v) for v in values)


def is_valid(opinion: sj.MultinomialOpinion) -> bool:
    masses = list(opinion.b()) + [opinion.u()]
    return is_finite(opinion) and all(
        -VALIDITY_TOLERANCE <= v <= 1.0 + VALIDITY_TOLERANCE for v in masses
    )


def _finite_or_zero(values: Sequence[float]) -> List[float]:
    # Derived quantities of invalid opinions (e.g. undefined unfusion) can be non-finite
    return [v if math.isfinite(v) else 0.0 for v in values]


def analyze(
    opinion: sj.MultinomialOpinion, pdf: bool = False, resolution: Optional[int] = None
) -> m.OpinionOut:
    valid = is_valid(opinion)
    dirichlet = opinion.dir()
    strength = list(dirichlet.strength())
    return m.OpinionOut(
        belief=list(opinion.b()),
        uncertainty=opinion.u(),
        base_rate=list(opinion.a()),
        projection=_finite_or_zero(opinion.p()),
        variance=_finite_or_zero(opinion.var()),
        uncertainty_maximum=_finite_or_zero([opinion.uMax()])[0],
        prior_weight=dirichlet.priorWeight(),
        strength=strength if all(math.isfinite(s) for s in strength) else None,
        valid=valid,
        pdf=opinion_pdf(opinion, resolution) if pdf and valid else None,
    )


def _analyze_all(
    opinions: Sequence[sj.MultinomialOpinion], options: m.PdfOptions
) -> List[m.OpinionOut]:
    return [analyze(o, options.pdf, options.pdf_resolution) for o in opinions]


def opinions(request: m.OpinionRequest) -> m.OpinionResponse:
    return m.OpinionResponse(opinions=_analyze_all([to_subj(o) for o in request.opinions], request))


def deduction(request: m.DeductionRequest) -> m.DeductionResponse:
    antecedent = to_subj(request.antecedent)
    conditionals = [to_subj(c) for c in request.conditionals]
    base_rate = list(request.antecedent.base_rate)
    dim = request.antecedent.dim

    result = sj.deduction(antecedent, conditionals)
    apex = sj.deduction(sj.MultinomialOpinion([0.0] * dim, 1.0, base_rate), conditionals)
    vertices = [
        sj.deduction(
            sj.MultinomialOpinion([1.0 if j == i else 0.0 for j in range(dim)], 0.0, base_rate),
            conditionals,
        )
        for i in range(dim)
    ]

    pdf, res = request.pdf, request.pdf_resolution
    return m.DeductionResponse(
        antecedent=analyze(antecedent, pdf, res),
        conditionals=[analyze(c) for c in conditionals],
        result=analyze(result, pdf, res),
        apex=analyze(apex),
        vertices=[analyze(v) for v in vertices],
        marginal_base_rate=list(result.a()),
    )


def fusion(request: m.FusionRequest) -> m.FusionResponse:
    sources = [to_subj(o) for o in request.opinions]
    if request.method == "cumulative":
        result = sj.cbf(sources)
    else:
        result = sj.abf(sources)
    return m.FusionResponse(
        opinions=_analyze_all(sources, request),
        result=analyze(result, request.pdf, request.pdf_resolution),
    )


def unfusion(request: m.UnfusionRequest) -> m.UnfusionResponse:
    fused = to_subj(request.fused)
    opinion = to_subj(request.opinion)
    base_rate = request.base_rate if request.base_rate is not None else list(request.fused.base_rate)

    response = m.UnfusionResponse(
        fused=analyze(fused, request.pdf, request.pdf_resolution),
        opinion=analyze(opinion, request.pdf, request.pdf_resolution),
    )

    result = sj.cumulativeUnfusion(fused, opinion, list(base_rate))
    if not is_finite(result):
        response.message = "Unfusion is undefined for these opinions (division by zero)."
        return response

    response.result = analyze(result, request.pdf, request.pdf_resolution)
    if response.result.valid:
        response.refused = analyze(sj.cbf(result, opinion))
    else:
        response.message = (
            "Unfusion yields no valid opinion: the fused opinion must contain at least the "
            "evidence of the contributing opinion for every state (b_C / u_C >= b_B / u_B), "
            "which implies u_C <= u_B."
        )
    return response


def trust_discounting(request: m.TrustDiscountingRequest) -> m.TrustDiscountingResponse:
    trust = to_subj(request.trust)
    opinion = to_subj(request.opinion)
    trust_probability = trust.p()[0]
    result = sj.td(opinion, trust_probability)
    pdf, res = request.pdf, request.pdf_resolution
    return m.TrustDiscountingResponse(
        trust=analyze(trust, pdf, res),
        opinion=analyze(opinion, pdf, res),
        trust_probability=trust_probability,
        result=analyze(result, pdf, res),
    )


def multiplication(request: m.MultiplicationRequest) -> m.MultiplicationResponse:
    x = to_subj(request.x)
    y = to_subj(request.y)
    result = sj.normalMultiplication(x, y)
    pdf, res = request.pdf, request.pdf_resolution
    return m.MultiplicationResponse(
        x=analyze(x, pdf, res),
        y=analyze(y, pdf, res),
        result=analyze(result),
        shape=(request.x.dim, request.y.dim),
    )
