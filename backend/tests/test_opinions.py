import pytest

from conftest import binomial, opinion, post


def analyze(client, op, **options):
    return post(client, "/api/opinions", {"opinions": [op], **options})["opinions"][0]


def test_info_lists_applied_patches(client):
    info = client.get("/api/info").json()
    assert info["pysubjVersion"] == "0.1.0"
    assert len(info["patches"]) == 8
    assert "Keep prior weight consistent between opinions and Dirichlet PDFs" in info["patches"]


@pytest.mark.parametrize(
    "payload, message",
    [
        (opinion([0.5, 0.2], 0.2), "sum to 1"),
        (opinion([0.5, -0.1], 0.6), "non-negative"),
        (opinion([0.5, 0.2], 0.3, [0.5, 0.6]), "base rates must sum to 1"),
        (opinion([0.5, 0.2], 0.3, [1.0]), "same length"),
        (opinion([1.0], 0.0, [1.0]), "at least 2"),
    ],
)
def test_invalid_opinions_are_rejected(client, payload, message):
    response = client.post("/api/opinions", json={"opinions": [payload]})
    assert response.status_code == 422
    assert message in response.text


def test_rounding_errors_are_normalized(client):
    result = analyze(client, opinion([0.3333333, 0.3333333], 0.3333333, [0.5000001, 0.5]))
    assert sum(result["belief"]) + result["uncertainty"] == pytest.approx(1.0, abs=1e-15)
    assert sum(result["baseRate"]) == pytest.approx(1.0, abs=1e-15)


def test_derived_quantities(client):
    result = analyze(client, opinion([0.6, 0.1], 0.3, [0.5, 0.5]))
    assert result["projection"] == pytest.approx([0.75, 0.25])
    # Var = P (1 - P) u / (W + u) with W = 2
    assert result["variance"] == pytest.approx([0.75 * 0.25 * 0.3 / 2.3] * 2)
    # u_max = min_i P_i / a_i
    assert result["uncertaintyMaximum"] == pytest.approx(0.5)
    # alpha = W (b / u + a)
    assert result["priorWeight"] == 2.0
    assert result["strength"] == pytest.approx([2 * (0.6 / 0.3 + 0.5), 2 * (0.1 / 0.3 + 0.5)])
    assert result["valid"] is True


def test_trinomial_prior_weight_is_dimension(client):
    result = analyze(client, opinion([0.0, 0.0, 0.0], 1.0))
    assert result["priorWeight"] == 3.0
    # Vacuous opinion with uniform base rate is the uniform Dirichlet PDF
    assert result["strength"] == pytest.approx([1.0, 1.0, 1.0])


def test_beta_pdf_integrates_to_one(client):
    result = analyze(client, binomial(0.4, 0.3, 0.3, 0.6), pdf=True, pdfResolution=400)
    pdf = result["pdf"]
    assert pdf["kind"] == "beta"
    dx = pdf["x"][1] - pdf["x"][0]
    assert sum(pdf["density"]) * dx == pytest.approx(1.0, abs=1e-3)
    mean = sum(x * f for x, f in zip(pdf["x"], pdf["density"])) * dx
    assert mean == pytest.approx(result["projection"][0], abs=1e-3)


def test_beta_pdf_of_strong_evidence_is_finite(client):
    result = analyze(client, binomial(0.6, 0.395, 0.005), pdf=True)
    assert all(f is not None for f in result["pdf"]["density"])
    assert max(result["pdf"]["density"]) > 10


def test_dirichlet3_pdf_integrates_to_one(client):
    n = 60
    result = analyze(client, opinion([0.3, 0.2, 0.1], 0.4, [0.2, 0.3, 0.5]), pdf=True, pdfResolution=n)
    pdf = result["pdf"]
    assert pdf["kind"] == "dirichlet3"
    assert len(pdf["cells"]) == n * n
    # Cells partition the simplex {p1 + p2 <= 1} of area 1/2
    total = sum(cell[3] for cell in pdf["cells"]) * 0.5 / n**2
    assert total == pytest.approx(1.0, abs=1e-2)


def test_marginal_pdfs_of_higher_dimensions(client):
    result = analyze(
        client, opinion([0.3, 0.2, 0.1, 0.1], 0.3, [0.1, 0.2, 0.3, 0.4]), pdf=True, pdfResolution=400
    )
    pdf = result["pdf"]
    assert pdf["kind"] == "marginals"
    dx = pdf["x"][1] - pdf["x"][0]
    for marginal, projection in zip(pdf["marginals"], result["projection"]):
        assert sum(marginal) * dx == pytest.approx(1.0, abs=1e-3)
        assert sum(x * f for x, f in zip(pdf["x"], marginal)) * dx == pytest.approx(projection, abs=1e-3)


def test_dogmatic_opinion_has_dirac_pdf(client):
    result = analyze(client, binomial(0.7, 0.3, 0.0, 0.2), pdf=True)
    assert "strength" not in result
    assert result["pdf"] == {"kind": "dogmatic", "point": pytest.approx([0.7, 0.3])}
