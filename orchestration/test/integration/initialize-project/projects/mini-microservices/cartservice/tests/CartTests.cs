using CartService;
using Xunit;

namespace CartServiceTests;

public class CartTests
{
    [Fact]
    public void Add_NewItem_AppendsToCart()
    {
        var cart = new Cart { UserId = "u1" };
        cart.Add(new CartItem("p1", 2));
        Assert.Single(cart.Items);
        Assert.Equal(2, cart.Items[0].Quantity);
    }

    [Fact]
    public void Add_ExistingItem_AccumulatesQuantity()
    {
        var cart = new Cart { UserId = "u1" };
        cart.Add(new CartItem("p1", 2));
        cart.Add(new CartItem("p1", 3));
        Assert.Single(cart.Items);
        Assert.Equal(5, cart.Items[0].Quantity);
    }

    [Fact]
    public void TotalQuantity_SumsAllItems()
    {
        var cart = new Cart { UserId = "u1" };
        cart.Add(new CartItem("p1", 2));
        cart.Add(new CartItem("p2", 4));
        Assert.Equal(6, cart.TotalQuantity());
    }
}
