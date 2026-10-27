import pytest

from conftest import binomial, opinion, post


def deduce(client, antecedent, conditionals, **options):
    return post(
        client, "/api/deduction", {"antecedent": antecedent, "conditionals": conditionals, **options}
    )


def masses(op):
    return op["belief"] + [op["uncertainty"]]


def test_binomial_example(client):
    result = deduce(
        client,
        binomial(0.6, 0.2, 0.2),
        [binomial(0.9, 0.0, 0.1), binomial(0.1, 0.6, 0.3)],
    )
    # Hand-computed: MBR = (0.5 b_y|x + 0.5 b_y|~x) / (1 - 0.5 u_y|x - 0.5 u_y|~x)
    assert result["marginalBaseRate"] == pytest.approx([0.625, 0.375])
    assert result["apex"]["uncertainty"] == pytest.approx(0.84)
    assert result["result"]["belief"] == pytest.approx([0.58, 0.132])
    assert result["result"]["uncertainty"] == pytest.approx(0.288)


@pytest.mark.parametrize(
    "antecedent, conditionals",
    [
        (
            binomial(0.3, 0.4, 0.3, 0.7),
            [binomial(0.7, 0.1, 0.2, 0.2), binomial(0.2, 0.5, 0.3, 0.9)],
        ),
        (
            opinion([0.2, 0.3, 0.1], 0.4, [0.5, 0.3, 0.2]),
            [
                opinion([0.5, 0.1, 0.1, 0.0], 0.3),
                opinion([0.1, 0.6, 0.0, 0.1], 0.2),
                opinion([0.0, 0.1, 0.3, 0.2], 0.4),
            ],
        ),
    ],
)
def test_deduction_properties(client, antecedent, conditionals):
    response = deduce(client, antecedent, conditionals)
    result, apex, vertices = response["result"], response["apex"], response["vertices"]
    mbr = response["marginalBaseRate"]
    x = response["antecedent"]

    assert result["valid"]
    assert sum(masses(result)) == pytest.approx(1.0)
    assert result["baseRate"] == pytest.approx(mbr)

    # The sub-simplex vertices are the conditionals with the marginal base rate
    for vertex, conditional in zip(vertices, conditionals):
        assert vertex["belief"] == pytest.approx(conditional["belief"])
        assert vertex["uncertainty"] == pytest.approx(conditional["uncertainty"])
        assert vertex["baseRate"] == pytest.approx(mbr)

    # Projection law: P(y || x) = sum_i P(x_i) P(y | x_i)
    expected = [
        sum(px * v["projection"][j] for px, v in zip(x["projection"], vertices))
        for j in range(len(mbr))
    ]
    assert result["projection"] == pytest.approx(expected)

    # The deduced opinion is the image of the antecedent under the linear mapping of the
    # antecedent simplex onto the sub-simplex: sum_i b_x(x_i) V_i + u_x apex
    image = [
        sum(b * masses(v)[j] for b, v in zip(x["belief"], vertices)) + x["uncertainty"] * masses(apex)[j]
        for j in range(len(mbr) + 1)
    ]
    assert masses(result) == pytest.approx(image)


def test_vacuous_conditionals_give_vacuous_result(client):
    result = deduce(client, binomial(0.6, 0.2, 0.2), [binomial(0, 0, 1, 0.3), binomial(0, 0, 1, 0.3)])
    assert result["result"]["uncertainty"] == pytest.approx(1.0)
    assert result["marginalBaseRate"] == pytest.approx([0.3, 0.7])


@pytest.mark.parametrize("zero_state", [0, 1])
def test_zero_marginal_base_rate_component(client, zero_state):
    def cond(b, u):
        belief = [0.0, 0.0]
        belief[1 - zero_state] = b
        return opinion(belief, u)

    result = deduce(client, binomial(0.6, 0.2, 0.2), [cond(0.9, 0.1), cond(0.4, 0.6)])["result"]
    assert result["valid"]
    assert result["baseRate"][zero_state] == pytest.approx(0.0)
    assert result["projection"][1 - zero_state] == pytest.approx(1.0)


def test_wrong_number_of_conditionals_is_rejected(client):
    response = client.post(
        "/api/deduction",
        json={
            "antecedent": opinion([0.2, 0.2, 0.2], 0.4),
            "conditionals": [binomial(0.5, 0.5, 0.0), binomial(0.5, 0.5, 0.0)],
        },
    )
    assert response.status_code == 422
    assert "one conditional opinion per antecedent state" in response.text


def test_pdf_of_result(client):
    response = deduce(
        client, binomial(0.6, 0.2, 0.2), [binomial(0.9, 0.0, 0.1), binomial(0.1, 0.6, 0.3)], pdf=True
    )
    assert response["result"]["pdf"]["kind"] == "beta"
    assert response["antecedent"]["pdf"]["kind"] == "beta"
